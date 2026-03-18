import type { DetectedEvent } from './detected-event.js';

interface Condition {
  match: Record<string, string>;
  predicate: { field: string; operator: string; value: number };
}

interface RuleInput {
  condition: Condition;
  fireMode: 'threshold_cross' | 'stateful_true' | 'every_poll';
  cooldownMs: number;
  lastFiredAt: Date | null;
}

export function matchesEvent(condition: Condition, event: DetectedEvent): boolean {
  const { match } = condition;
  for (const [key, value] of Object.entries(match)) {
    if ((event as any)[key] !== value) return false;
  }
  return true;
}

function evaluatePredicate(predicate: Condition['predicate'], event: DetectedEvent): boolean {
  const actual = (event as any)[predicate.field];
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

export function evaluateRule(rule: RuleInput, event: DetectedEvent): boolean {
  if (!matchesEvent(rule.condition, event)) return false;
  if (!isCooldownExpired(rule.lastFiredAt, rule.cooldownMs)) return false;
  if (!evaluatePredicate(rule.condition.predicate, event)) return false;
  return true;
}
