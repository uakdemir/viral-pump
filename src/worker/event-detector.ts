import { eq, and } from 'drizzle-orm';
import { triggerRules } from '../shared/schema/trigger-rules.js';
import { contentTemplates } from '../shared/schema/content-templates.js';
import { verticals } from '../shared/schema/verticals.js';
import { FIRE_MODES, TEMPLATE_SELECTION } from '../shared/constants.js';
import type { DB } from '../shared/db.js';
import type { DetectedEvent } from '../domain/detected-event.js';
import type { JobQueue } from '../plugins/job-queue/types.js';
import {
  DefaultTriggerEvaluator,
  validateContentConfig,
  matchesEvent,
  evaluatePredicates,
  type TriggerEvaluator,
  type RuleInput,
} from '../domain/trigger-evaluator.js';
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
  // In-memory predicate state per rule — avoids type-unsafe mutation of Drizzle result objects
  private predicateState = new Map<string, boolean>();

  constructor(deps: EventDetectorDeps) {
    this.deps = deps;
  }

  async processEvents(events: DetectedEvent[], verticalId: string): Promise<void> {
    const [vertical] = await this.deps.db.select().from(verticals)
      .where(eq(verticals.id, verticalId));
    const evaluatorName = (vertical?.config as any)?.defaults?.triggerEvaluator ?? 'default';
    const evaluator = this.deps.evaluatorRegistry.resolve(evaluatorName, {});

    const rules = await this.deps.db.select().from(triggerRules)
      .where(and(
        eq(triggerRules.verticalId, verticalId),
        eq(triggerRules.enabled, true),
      ));

    // Initialize in-memory state from DB values
    for (const rule of rules) {
      if (rule.lastPredicateResult != null) {
        this.predicateState.set(rule.id, rule.lastPredicateResult);
      }
    }

    for (const event of events) {
      for (const rule of rules) {
        if (rule.fireMode === FIRE_MODES.SCHEDULED) continue;

        const condition = rule.condition as any;
        const contentConfig = rule.contentConfig as any;

        if (!validateContentConfig(contentConfig)) {
          this.deps.logger.error({ rule: rule.name }, 'Misconfigured content_config — skipping rule');
          continue;
        }

        const ruleCondition = {
          match: condition.match ?? {},
          predicates: condition.predicates ?? [],
          logic: (condition.logic ?? 'AND') as 'AND' | 'OR',
        };

        // Build rule input with CURRENT in-memory predicate state (before evaluation)
        const ruleInput: RuleInput = {
          condition: ruleCondition,
          fireMode: rule.fireMode as any,
          cooldownMs: rule.cooldownMs,
          lastFiredAt: rule.lastFiredAt,
          lastPredicateResult: this.predicateState.get(rule.id),
          contentConfig,
        };

        const shouldFire = evaluator.evaluate(ruleInput, event);

        // Update predicate state AFTER evaluation — only for matching events
        if (matchesEvent(ruleCondition.match, event)) {
          const currentResult = evaluatePredicates(ruleCondition.predicates, ruleCondition.logic, event.data);
          this.predicateState.set(rule.id, currentResult);
          await this.deps.db.update(triggerRules)
            .set({ lastPredicateResult: currentResult })
            .where(eq(triggerRules.id, rule.id));
        }

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

        // Resolve and validate ALL configured templates BEFORE consuming cooldown
        const allTemplates = await this.deps.db.select().from(contentTemplates)
          .where(and(
            eq(contentTemplates.verticalId, verticalId),
            eq(contentTemplates.enabled, true),
          ));

        const resolvedTemplates = allTemplates.filter(t =>
          contentConfig.templateNames.includes(t.name)
        );

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

        let selectedTemplates = resolvedTemplates;
        if (contentConfig.templateSelection === TEMPLATE_SELECTION.RANDOM && selectedTemplates.length > 0) {
          selectedTemplates = [selectedTemplates[Math.floor(Math.random() * selectedTemplates.length)]];
        }

        this.deps.logger.info({ rule: rule.name, event: (event.data as any).instrument ?? event.type }, 'Trigger rule fired');

        // Update last_fired_at AFTER template validation succeeds
        await this.deps.db.update(triggerRules)
          .set({ lastFiredAt: new Date() })
          .where(eq(triggerRules.id, rule.id));
        // Also update in-memory for subsequent events in batch
        (rule as any).lastFiredAt = new Date();

        for (const template of selectedTemplates) {
          await this.deps.jobQueue.enqueue(JOB_TYPES.GENERATE_CONTENT, {
            verticalId,
            templateId: template.id,
            eventData: event,
            ruleId: rule.id,
          });
        }
      }
    }
  }
}

// Re-export for use in worker/index.ts
import { JOB_TYPES } from '../shared/constants.js';
