import type { DetectedEvent } from './detected-event.js';
import { FIRE_MODES, TEMPLATE_SELECTION, type FireMode } from '../shared/constants.js';

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
  fireMode: FireMode;
  cooldownMs: number;
  lastFiredAt: Date | null;
  lastPredicateResult?: boolean; // previous evaluation result, for threshold_cross transition detection
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

function evaluatePredicate(
  predicate: { field: string; operator: string; value: number },
  eventData: Record<string, unknown>,
): boolean {
  const actual = eventData[predicate.field];
  if (typeof actual !== 'number') return false;

  switch (predicate.operator) {
    case 'gt':
      return actual > predicate.value;
    case 'gte':
      return actual >= predicate.value;
    case 'lt':
      return actual < predicate.value;
    case 'lte':
      return actual <= predicate.value;
    case 'eq':
      return actual === predicate.value;
    default:
      return false;
  }
}

function isCooldownExpired(lastFiredAt: Date | null, cooldownMs: number): boolean {
  if (!lastFiredAt) return true;
  return Date.now() - lastFiredAt.getTime() >= cooldownMs;
}

export function evaluatePredicates(
  predicates: RuleCondition['predicates'],
  logic: 'AND' | 'OR',
  eventData: Record<string, unknown>,
): boolean {
  if (predicates.length === 0) return true;
  if (logic === 'OR') {
    return predicates.some(p => evaluatePredicate(p, eventData));
  }
  return predicates.every(p => evaluatePredicate(p, eventData));
}

export class DefaultTriggerEvaluator implements TriggerEvaluator {
  evaluate(rule: RuleInput, event: DetectedEvent): boolean {
    // Scheduled triggers are handled by the cron scheduler, not the event evaluator
    if (rule.fireMode === FIRE_MODES.SCHEDULED) return false;

    if (!matchesEvent(rule.condition.match, event)) return false;
    if (!isCooldownExpired(rule.lastFiredAt, rule.cooldownMs)) return false;

    const { predicates, logic } = rule.condition;
    const currentResult = evaluatePredicates(predicates, logic, event.data);

    switch (rule.fireMode) {
      case FIRE_MODES.EVERY_POLL:
        // Fire on every poll regardless of predicates
        return true;

      case FIRE_MODES.STATEFUL_TRUE:
        // Fire every poll while predicates are currently true
        return currentResult;

      case FIRE_MODES.THRESHOLD_CROSS:
        // Fire only on transition: was false (or first evaluation), now true
        if (!currentResult) return false;
        if (rule.lastPredicateResult === true) return false; // still true, no transition
        return true; // was false/undefined, now true — transition!

      default:
        return currentResult;
    }
  }
}

export function validateContentConfig(config: unknown): config is ContentConfig {
  if (!config || typeof config !== 'object') return false;
  const c = config as any;
  if (
    c.templateSelection !== TEMPLATE_SELECTION.NAMED &&
    c.templateSelection !== TEMPLATE_SELECTION.RANDOM
  )
    return false;
  if (!Array.isArray(c.templateNames) || c.templateNames.length === 0) return false;
  return c.templateNames.every((n: unknown) => typeof n === 'string');
}
