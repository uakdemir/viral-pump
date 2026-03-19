import type { DetectedEvent } from './detected-event.js';

export interface RuleCondition {
  match: Record<string, string>;
  predicates: Array<{ field: string; operator: string; value: number }>;
  logic: 'AND' | 'OR';
}

export interface ContentConfig {
  templateSelection: 'named' | 'random';
  templateNames: string[];
}

export interface RuleInput {
  condition: RuleCondition;
  fireMode: 'threshold_cross' | 'stateful_true' | 'every_poll' | 'scheduled';
  cooldownMs: number;
  lastFiredAt: Date | null;
  contentConfig: ContentConfig;
}

export interface TriggerEvaluator {
  evaluate(rule: RuleInput, event: DetectedEvent): boolean;
}

// Top-level DetectedEvent field names — matched from event root, not event.data
const TOP_LEVEL_MATCH_FIELDS = new Set(['source', 'type', 'verticalId']);

export function matchesEvent(match: Record<string, string>, event: DetectedEvent): boolean {
  for (const [key, value] of Object.entries(match)) {
    if (TOP_LEVEL_MATCH_FIELDS.has(key)) {
      if ((event as any)[key] !== value) return false;
    } else {
      if ((event.data as any)[key] !== value) return false;
    }
  }
  return true;
}

function evaluatePredicate(predicate: { field: string; operator: string; value: number }, eventData: Record<string, unknown>): boolean {
  const actual = eventData[predicate.field];
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

function isCooldownExpired(lastFiredAt: Date | null, cooldownMs: number): boolean {
  if (!lastFiredAt) return true;
  return Date.now() - lastFiredAt.getTime() >= cooldownMs;
}

export class DefaultTriggerEvaluator implements TriggerEvaluator {
  evaluate(rule: RuleInput, event: DetectedEvent): boolean {
    // Scheduled triggers are handled by the cron scheduler, not the event evaluator
    if (rule.fireMode === 'scheduled') return false;

    if (!matchesEvent(rule.condition.match, event)) return false;
    if (!isCooldownExpired(rule.lastFiredAt, rule.cooldownMs)) return false;

    const { predicates, logic } = rule.condition;
    if (predicates.length === 0) return true;

    if (logic === 'OR') {
      return predicates.some(p => evaluatePredicate(p, event.data));
    }
    // Default: AND
    return predicates.every(p => evaluatePredicate(p, event.data));
  }
}

export function validateContentConfig(config: unknown): config is ContentConfig {
  if (!config || typeof config !== 'object') return false;
  const c = config as any;
  if (c.templateSelection !== 'named' && c.templateSelection !== 'random') return false;
  if (!Array.isArray(c.templateNames) || c.templateNames.length === 0) return false;
  return c.templateNames.every((n: unknown) => typeof n === 'string');
}
