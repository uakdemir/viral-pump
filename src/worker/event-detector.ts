import { eq, and } from 'drizzle-orm';
import { triggerRules } from '../shared/schema/trigger-rules.js';
import { contentTemplates } from '../shared/schema/content-templates.js';
import type { DB } from '../shared/db.js';
import type { DetectedEvent } from '../domain/detected-event.js';
import type { JobQueue } from '../plugins/job-queue/types.js';
import { evaluateRule } from '../domain/trigger-evaluator.js';

interface EventDetectorDeps {
  db: DB;
  jobQueue: JobQueue;
  logger: { info: (...args: any[]) => void; warn: (...args: any[]) => void };
}

export class EventDetector {
  private deps: EventDetectorDeps;

  constructor(deps: EventDetectorDeps) {
    this.deps = deps;
  }

  async processEvents(events: DetectedEvent[], verticalId: string): Promise<void> {
    const rules = await this.deps.db.select().from(triggerRules)
      .where(and(
        eq(triggerRules.verticalId, verticalId),
        eq(triggerRules.enabled, true),
      ));

    for (const event of events) {
      for (const rule of rules) {
        const condition = rule.condition as { match: Record<string, string>; predicate: { field: string; operator: string; value: number } };
        const shouldFire = evaluateRule({
          condition,
          fireMode: rule.fireMode as 'threshold_cross' | 'stateful_true' | 'every_poll',
          cooldownMs: rule.cooldownMs,
          lastFiredAt: rule.lastFiredAt,
        }, event);

        if (!shouldFire) {
          this.deps.logger.info({
            rule: rule.name,
            event: event.instrument,
            changePct: Number(event.changePct.toFixed(4)),
            threshold: condition.predicate.value,
            cooldownExpired: !rule.lastFiredAt || (Date.now() - rule.lastFiredAt.getTime() >= rule.cooldownMs),
          }, 'Rule evaluated — did not fire');
          continue;
        }

        this.deps.logger.info({ rule: rule.name, event: event.instrument }, 'Trigger rule fired');

        // Update last_fired_at
        await this.deps.db.update(triggerRules)
          .set({ lastFiredAt: new Date() })
          .where(eq(triggerRules.id, rule.id));

        // Find matching templates
        const templates = await this.deps.db.select().from(contentTemplates)
          .where(and(
            eq(contentTemplates.verticalId, verticalId),
            eq(contentTemplates.enabled, true),
          ));

        for (const template of templates) {
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
}
