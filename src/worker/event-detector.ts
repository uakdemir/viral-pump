import { eq, and } from 'drizzle-orm';
import { triggerRules } from '../shared/schema/trigger-rules.js';
import { contentTemplates } from '../shared/schema/content-templates.js';
import { verticals } from '../shared/schema/verticals.js';
import { FIRE_MODES, JOB_TYPES } from '../shared/constants.js';
import type { DB } from '../shared/db.js';
import type { DetectedEvent } from '../domain/detected-event.js';
import type { JobQueue } from '../plugins/job-queue/types.js';
import {
  DefaultTriggerEvaluator,
  matchesEvent,
  evaluatePredicates,
  type TriggerEvaluator,
  type RuleInput,
} from '../domain/trigger-evaluator.js';
import { resolveTemplates } from '../domain/template-resolver.js';
import { asVerticalConfig, asRuleCondition, asContentConfig } from '../domain/config-parsers.js';
import { createRegistry, type PluginRegistry } from '../plugins/registry.js';
import type { LoggerLike } from '../shared/logger.js';

export function createTriggerEvaluatorRegistry(): PluginRegistry<TriggerEvaluator> {
  const registry = createRegistry<TriggerEvaluator>();
  registry.register('default', () => new DefaultTriggerEvaluator());
  return registry;
}

interface EventDetectorDeps {
  db: DB;
  jobQueue: JobQueue;
  evaluatorRegistry: PluginRegistry<TriggerEvaluator>;
  logger: LoggerLike;
}

export class EventDetector {
  private deps: EventDetectorDeps;
  // In-memory state per rule — avoids type-unsafe mutation of Drizzle result objects
  // These maps persist across processEvents calls (correct for threshold_cross tracking)
  private predicateState = new Map<string, boolean>();
  private lastFiredState = new Map<string, Date>();

  constructor(deps: EventDetectorDeps) {
    this.deps = deps;
  }

  async processEvents(events: DetectedEvent[], verticalId: string): Promise<void> {
    const [vertical] = await this.deps.db
      .select()
      .from(verticals)
      .where(eq(verticals.id, verticalId));
    const evaluatorName =
      asVerticalConfig(vertical?.config).defaults?.triggerEvaluator ?? 'default';
    const evaluator = this.deps.evaluatorRegistry.resolve(evaluatorName, {});

    const rules = await this.deps.db
      .select()
      .from(triggerRules)
      .where(and(eq(triggerRules.verticalId, verticalId), eq(triggerRules.enabled, true)));

    // Initialize in-memory state from DB values (only if not already tracked)
    for (const rule of rules) {
      if (rule.lastPredicateResult != null && !this.predicateState.has(rule.id)) {
        this.predicateState.set(rule.id, rule.lastPredicateResult);
      }
      if (rule.lastFiredAt && !this.lastFiredState.has(rule.id)) {
        this.lastFiredState.set(rule.id, rule.lastFiredAt);
      }
    }

    for (const event of events) {
      for (const rule of rules) {
        if (rule.fireMode === FIRE_MODES.SCHEDULED) continue;

        const contentConfig = asContentConfig(rule.contentConfig);
        const ruleCondition = asRuleCondition(rule.condition);

        // Build rule input with CURRENT in-memory predicate state (before evaluation)
        const ruleInput: RuleInput = {
          condition: ruleCondition,
          fireMode: rule.fireMode as any,
          cooldownMs: rule.cooldownMs,
          lastFiredAt: this.lastFiredState.get(rule.id) ?? rule.lastFiredAt,
          lastPredicateResult: this.predicateState.get(rule.id),
          contentConfig,
        };

        const shouldFire = evaluator.evaluate(ruleInput, event);

        // Update predicate state AFTER evaluation — only for matching events, only when changed
        if (matchesEvent(ruleCondition.match, event)) {
          const currentResult = evaluatePredicates(
            ruleCondition.predicates,
            ruleCondition.logic,
            event.data,
          );
          if (this.predicateState.get(rule.id) !== currentResult) {
            this.predicateState.set(rule.id, currentResult);
            await this.deps.db
              .update(triggerRules)
              .set({ lastPredicateResult: currentResult })
              .where(eq(triggerRules.id, rule.id));
          }
        }

        if (!shouldFire) {
          this.deps.logger.info(
            {
              rule: rule.name,
              event: (event.data.instrument as string) ?? event.type,
              changePct: Number(Number(event.data.changePct ?? 0).toFixed(4)),
              threshold: ruleCondition.predicates?.[0]?.value,
              cooldownExpired:
                !rule.lastFiredAt || Date.now() - rule.lastFiredAt.getTime() >= rule.cooldownMs,
            },
            'Rule evaluated — did not fire',
          );
          continue;
        }

        const allTemplates = await this.deps.db
          .select()
          .from(contentTemplates)
          .where(
            and(eq(contentTemplates.verticalId, verticalId), eq(contentTemplates.enabled, true)),
          );

        const resolution = resolveTemplates(contentConfig, allTemplates);

        if (!resolution.ok) {
          this.deps.logger.error(
            {
              rule: rule.name,
              reason: resolution.reason,
              ...(resolution.reason === 'missing-templates'
                ? { missingNames: resolution.missingNames }
                : {}),
            },
            resolution.reason === 'invalid-content-config'
              ? 'Misconfigured content_config — skipping rule'
              : 'Some configured template names not found or disabled — skipping without consuming cooldown',
          );
          continue;
        }

        const selectedTemplates = resolution.selectedTemplates;

        this.deps.logger.info(
          { rule: rule.name, event: (event.data.instrument as string) ?? event.type },
          'Trigger rule fired',
        );

        // Atomic: update last_fired_at + enqueue jobs in one transaction
        // If enqueue fails, cooldown is not consumed
        const firedAt = new Date();
        await this.deps.db.transaction(async tx => {
          await tx
            .update(triggerRules)
            .set({ lastFiredAt: firedAt })
            .where(eq(triggerRules.id, rule.id));

          for (const template of selectedTemplates) {
            await this.deps.jobQueue.enqueue(JOB_TYPES.GENERATE_CONTENT, {
              verticalId,
              templateId: template.id,
              eventData: event,
              ruleId: rule.id,
            });
          }
        });
        this.lastFiredState.set(rule.id, firedAt);
      }
    }
  }
}
