import { eq, and, sql } from 'drizzle-orm';
import { CronExpressionParser } from 'cron-parser';
import { FIRE_MODES, JOB_TYPES, TEMPLATE_SELECTION } from '../shared/constants.js';
import { dataSources } from '../shared/schema/data-sources.js';
import { triggerRules } from '../shared/schema/trigger-rules.js';
import { contentTemplates } from '../shared/schema/content-templates.js';
import { jobQueue as jobQueueTable } from '../shared/schema/job-queue.js';
import type { DB } from '../shared/db.js';
import type { DataSourceProvider } from '../plugins/data-sources/types.js';
import type { DetectedEvent } from '../domain/detected-event.js';
import { createRegistry, type PluginRegistry } from '../plugins/registry.js';
import { CoinGeckoProvider } from '../plugins/data-sources/coingecko.js';
import { ExchangeRateProvider } from '../plugins/data-sources/exchangerate.js';
import { validateContentConfig } from '../domain/trigger-evaluator.js';

export function createDataSourceRegistry(): PluginRegistry<DataSourceProvider> {
  const registry = createRegistry<DataSourceProvider>();
  registry.register('coingecko', (config) => new CoinGeckoProvider(config));
  registry.register('exchangerate', (config) => new ExchangeRateProvider(config));
  return registry;
}

interface SchedulerDeps {
  db: DB;
  registry: PluginRegistry<DataSourceProvider>;
  onEvents: (events: DetectedEvent[], verticalId: string) => Promise<void>;
  logger: { info: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void };
}

export class Scheduler {
  private timers = new Map<string, NodeJS.Timeout>();
  private providers = new Map<string, DataSourceProvider>();
  private cronTimer: NodeJS.Timeout | undefined;
  private deps: SchedulerDeps;

  constructor(deps: SchedulerDeps) {
    this.deps = deps;
  }

  async start(): Promise<void> {
    // Start data source polling
    const sources = await this.deps.db.select().from(dataSources)
      .where(eq(dataSources.status, 'active'));

    for (const source of sources) {
      const config = source.config as Record<string, unknown>;
      const provider = this.deps.registry.resolve(source.provider, config);
      this.providers.set(source.id, provider);

      this.deps.logger.info({ provider: source.provider, intervalMs: source.pollIntervalMs }, 'Starting data source polling');

      this.pollSource(source.id, source.verticalId, source.pollIntervalMs);
    }

    // Initialize scheduled triggers (compute next_scheduled_at for new/stale rules)
    await this.initScheduledTriggers();

    // Start cron check loop
    this.cronTimer = setInterval(() => this.checkScheduledTriggers(), 60000);
    // Also check immediately
    this.checkScheduledTriggers();
  }

  private pollSource(sourceId: string, verticalId: string, intervalMs: number): void {
    const poll = async () => {
      try {
        const provider = this.providers.get(sourceId);
        if (!provider) return;

        const events = await provider.poll(verticalId);

        this.deps.logger.info({
          sourceId,
          eventCount: events.length,
          events: events.map(e => ({
            instrument: (e.data as any).instrument,
            price: (e.data as any).price,
            previousPrice: (e.data as any).previousPrice,
            changePct: Number(((e.data as any).changePct ?? 0).toFixed(4)),
          })),
        }, 'Poll completed');

        if (events.length > 0) {
          await this.deps.onEvents(events, verticalId);
        }

        await this.deps.db.update(dataSources)
          .set({ lastPolledAt: new Date() })
          .where(eq(dataSources.id, sourceId));
      } catch (err) {
        this.deps.logger.error({ err, sourceId }, 'Poll failed');
      }
    };

    poll();
    const timer = setInterval(poll, intervalMs);
    this.timers.set(sourceId, timer);
  }

  private async initScheduledTriggers(): Promise<void> {
    // Find all scheduled rules with NULL or past next_scheduled_at
    const rules = await this.deps.db.select().from(triggerRules)
      .where(and(
        eq(triggerRules.fireMode, FIRE_MODES.SCHEDULED),
        eq(triggerRules.enabled, true),
      ));

    const now = new Date();
    for (const rule of rules) {
      if (!rule.schedule) continue;
      if (rule.nextScheduledAt && rule.nextScheduledAt > now) continue;

      // Compute next firing time (skip missed, don't catch up)
      try {
        const interval = CronExpressionParser.parse(rule.schedule, { currentDate: now, tz: 'UTC' });
        const next = interval.next().toDate();
        await this.deps.db.update(triggerRules)
          .set({ nextScheduledAt: next })
          .where(eq(triggerRules.id, rule.id));
        this.deps.logger.info({ rule: rule.name, nextScheduledAt: next.toISOString() }, 'Initialized scheduled trigger');
      } catch (err) {
        this.deps.logger.error({ err, rule: rule.name }, 'Invalid cron expression');
      }
    }
  }

  private async checkScheduledTriggers(): Promise<void> {
    // Process ALL due rules per cycle
    while (true) {
      try {
        const fired = await this.claimAndFireScheduledRule();
        if (!fired) break; // No more due rules
      } catch (err) {
        this.deps.logger.error({ err }, 'Scheduled trigger check failed');
        break;
      }
    }
  }

  private async claimAndFireScheduledRule(): Promise<boolean> {
    const now = new Date().toISOString();
    let fired = false;
    let ruleName = '';
    let templateNamesList: string[] = [];
    let selectionMode = '';

    // Entire claim + job insert + advance in one transaction
    await this.deps.db.transaction(async (tx) => {
      // Claim a due rule with row lock
      const claimedRows = await tx.execute(sql`
        SELECT id, name, vertical_id, schedule, content_config, cooldown_ms, last_fired_at, next_scheduled_at
        FROM trigger_rules
        WHERE fire_mode = 'scheduled'
          AND enabled = true
          AND next_scheduled_at <= ${now}::timestamptz
        ORDER BY next_scheduled_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);

      if (!claimedRows.length) return; // no due rules

      const rule = claimedRows[0] as any;
      ruleName = rule.name;
      const scheduledAt = rule.next_scheduled_at;

      // Validate content_config
      const contentConfig = rule.content_config;
      if (!validateContentConfig(contentConfig)) {
        this.deps.logger.error({ rule: rule.name, contentConfig }, 'Misconfigured content_config — skipping');
        await this.advanceScheduleInTx(tx, rule.id, rule.schedule);
        fired = true;
        return;
      }

      // Check cooldown
      if (rule.last_fired_at) {
        const elapsed = Date.now() - new Date(rule.last_fired_at).getTime();
        if (elapsed < rule.cooldown_ms) {
          await this.advanceScheduleInTx(tx, rule.id, rule.schedule);
          fired = true;
          return;
        }
      }

      // Resolve templates
      const templateNames: string[] = contentConfig.templateNames;
      selectionMode = contentConfig.templateSelection;

      // Resolve ALL configured templates first — validate before selecting
      const templates = await tx.select().from(contentTemplates)
        .where(and(
          eq(contentTemplates.verticalId, rule.vertical_id),
          eq(contentTemplates.enabled, true),
        ));

      const resolvedTemplates = templates.filter(t => templateNames.includes(t.name));
      const resolvedNames = new Set(resolvedTemplates.map(t => t.name));
      const missingNames = templateNames.filter((n: string) => !resolvedNames.has(n));

      if (missingNames.length > 0) {
        this.deps.logger.error({ rule: rule.name, missingNames, templateNames }, 'Some configured template names not found or disabled — skipping');
        await this.advanceScheduleInTx(tx, rule.id, rule.schedule);
        fired = true;
        return;
      }

      // Apply selection mode after full validation
      let matchedTemplates = resolvedTemplates;
      if (contentConfig.templateSelection === TEMPLATE_SELECTION.RANDOM && matchedTemplates.length > 0) {
        matchedTemplates = [matchedTemplates[Math.floor(Math.random() * matchedTemplates.length)]];
      }

      templateNamesList = matchedTemplates.map(t => t.name);

      // Create synthetic event
      const syntheticEvent = {
        source: 'scheduler',
        type: 'scheduled',
        verticalId: rule.vertical_id,
        observedAt: new Date().toISOString(),
        data: {
          triggerType: 'scheduled',
          scheduledAt,
          ruleName: rule.name,
        },
        rawPayload: {},
      };

      // Insert jobs — use (rule_id, scheduled_at, template_id) for dedup
      for (const template of matchedTemplates) {
        await tx.insert(jobQueueTable).values({
          type: JOB_TYPES.GENERATE_CONTENT,
          payload: {
            verticalId: rule.vertical_id,
            templateId: template.id,
            eventData: syntheticEvent,
            ruleId: rule.id,
            triggeredBy: 'scheduled',
            scheduledAt,
          },
        });
      }

      // Advance schedule and update last_fired_at — all within same transaction
      await this.advanceScheduleInTx(tx, rule.id, rule.schedule);
      await tx.update(triggerRules)
        .set({ lastFiredAt: new Date() })
        .where(eq(triggerRules.id, rule.id));

      fired = true;
    });

    if (fired && templateNamesList.length > 0) {
      this.deps.logger.info({
        rule: ruleName,
        templates: templateNamesList,
        selection: selectionMode,
      }, 'Scheduled trigger fired');
    }

    return fired;
  }

  private async advanceScheduleInTx(tx: any, ruleId: string, schedule: string): Promise<void> {
    try {
      const interval = CronExpressionParser.parse(schedule, { currentDate: new Date(), tz: 'UTC' });
      const next = interval.next().toDate();
      await tx.update(triggerRules)
        .set({ nextScheduledAt: next })
        .where(eq(triggerRules.id, ruleId));
    } catch (err) {
      this.deps.logger.error({ err, ruleId }, 'Failed to compute next schedule');
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    if (this.cronTimer) clearInterval(this.cronTimer);
  }
}
