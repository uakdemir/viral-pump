import { eq, and } from 'drizzle-orm';
import { triggerRules } from '../shared/schema/trigger-rules.js';
import { contentTemplates } from '../shared/schema/content-templates.js';
import { verticals } from '../shared/schema/verticals.js';
import type { DB } from '../shared/db.js';
import type { DetectedEvent } from '../domain/detected-event.js';
import type { JobQueue } from '../plugins/job-queue/types.js';
import { DefaultTriggerEvaluator, validateContentConfig, matchesEvent, type TriggerEvaluator, type RuleInput } from '../domain/trigger-evaluator.js';
import { createRegistry, type PluginRegistry } from '../plugins/registry.js';

export function createTriggerEvaluatorRegistry(): PluginRegistry<TriggerEvaluator> {
  const registry = createRegistry<TriggerEvaluator>();
  registry.register('default', () => new DefaultTriggerEvaluator());
  return registry;
}

interface EventDetectorDeps {
  db: DB;
  jobQueue: JobQueue;
  evaluatorRegistry: PluginRegistry<TriggerEvaluator>;
  logger: { info: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void };
}

export class EventDetector {
  private deps: EventDetectorDeps;

  constructor(deps: EventDetectorDeps) {
    this.deps = deps;
  }

  async processEvents(events: DetectedEvent[], verticalId: string): Promise<void> {
    // Resolve evaluator from vertical config
    const [vertical] = await this.deps.db.select().from(verticals)
      .where(eq(verticals.id, verticalId));
    const evaluatorName = (vertical?.config as any)?.defaults?.triggerEvaluator ?? 'default';
    const evaluator = this.deps.evaluatorRegistry.resolve(evaluatorName, {});

    const rules = await this.deps.db.select().from(triggerRules)
      .where(and(
        eq(triggerRules.verticalId, verticalId),
        eq(triggerRules.enabled, true),
      ));

    for (const event of events) {
      for (const rule of rules) {
        // Skip scheduled rules — they're handled by the cron scheduler
        if (rule.fireMode === 'scheduled') continue;

        const condition = rule.condition as any;
        const contentConfig = rule.contentConfig as any;

        // Validate content_config
        if (!validateContentConfig(contentConfig)) {
          this.deps.logger.error({ rule: rule.name }, 'Misconfigured content_config — skipping rule');
          continue;
        }

        const ruleCondition = {
          match: condition.match ?? {},
          predicates: condition.predicates ?? [],
          logic: (condition.logic ?? 'AND') as 'AND' | 'OR',
        };

        // Only track predicate state for events that match this rule's match clause
        const eventMatches = matchesEvent(ruleCondition.match, event);

        if (eventMatches) {
          // Compute current predicate result for threshold_cross tracking
          const currentPredicateResult = ruleCondition.predicates.length === 0 ? true :
            (ruleCondition.logic === 'OR'
              ? ruleCondition.predicates.some((p: any) => this.evalPredicate(p, event.data))
              : ruleCondition.predicates.every((p: any) => this.evalPredicate(p, event.data)));

          // Persist to DB and update in-memory state for subsequent events in this batch
          await this.deps.db.update(triggerRules)
            .set({ lastPredicateResult: currentPredicateResult })
            .where(eq(triggerRules.id, rule.id));
          (rule as any).lastPredicateResult = currentPredicateResult;
        }

        const ruleInput: RuleInput = {
          condition: ruleCondition,
          fireMode: rule.fireMode as any,
          cooldownMs: rule.cooldownMs,
          lastFiredAt: rule.lastFiredAt,
          lastPredicateResult: rule.lastPredicateResult ?? undefined,
          contentConfig,
        };

        const shouldFire = evaluator.evaluate(ruleInput, event);

        if (!shouldFire) {
          this.deps.logger.info({
            rule: rule.name,
            event: (event.data as any).instrument ?? event.type,
            changePct: Number(((event.data as any).changePct ?? 0).toFixed(4)),
            threshold: condition.predicates?.[0]?.value,
            cooldownExpired: !rule.lastFiredAt || (Date.now() - rule.lastFiredAt.getTime() >= rule.cooldownMs),
          }, 'Rule evaluated — did not fire');
          continue;
        }

        // Resolve and validate ALL configured templates BEFORE updating last_fired_at
        const allTemplates = await this.deps.db.select().from(contentTemplates)
          .where(and(
            eq(contentTemplates.verticalId, verticalId),
            eq(contentTemplates.enabled, true),
          ));

        const resolvedTemplates = allTemplates.filter(t =>
          contentConfig.templateNames.includes(t.name)
        );

        // ALL configured names must resolve — partial matches are misconfiguration
        const resolvedNames = new Set(resolvedTemplates.map(t => t.name));
        const missingNames = contentConfig.templateNames.filter((n: string) => !resolvedNames.has(n));

        if (missingNames.length > 0) {
          this.deps.logger.error({
            rule: rule.name,
            missingNames,
            configuredNames: contentConfig.templateNames,
          }, 'Some configured template names not found or disabled — skipping without consuming cooldown');
          continue;
        }

        // Apply selection mode after full validation
        let selectedTemplates = resolvedTemplates;
        if (contentConfig.templateSelection === 'random' && selectedTemplates.length > 0) {
          selectedTemplates = [selectedTemplates[Math.floor(Math.random() * selectedTemplates.length)]];
        }

        this.deps.logger.info({ rule: rule.name, event: (event.data as any).instrument ?? event.type }, 'Trigger rule fired');

        // Update last_fired_at AFTER template validation
        await this.deps.db.update(triggerRules)
          .set({ lastFiredAt: new Date() })
          .where(eq(triggerRules.id, rule.id));

        for (const template of selectedTemplates) {
          await this.deps.jobQueue.enqueue('generate-content', {
            verticalId,
            templateId: template.id,
            eventData: event,
            ruleId: rule.id,
          });
        }
      }
    }
  }

  private evalPredicate(predicate: { field: string; operator: string; value: number }, data: Record<string, unknown>): boolean {
    const actual = data[predicate.field];
    if (typeof actual !== 'number') return false;
    switch (predicate.operator) {
      case 'gt': return actual > predicate.value;
      case 'gte': return actual >= predicate.value;
      case 'lt': return actual < predicate.value;
      case 'lte': return actual <= predicate.value;
      case 'eq': return actual === predicate.value;
      default: return false;
    }
  }
}
