import type { ContentConfig, RuleCondition } from './trigger-evaluator.js';

export type { ContentConfig, RuleCondition };

export interface VerticalConfig {
  defaults?: {
    triggerEvaluator?: string;
    contentGenerator?: { provider?: string; model?: string };
    tagVocabulary?: string[];
  };
}

export function asVerticalConfig(raw: unknown): VerticalConfig {
  return (raw ?? {}) as VerticalConfig;
}

export function asRuleCondition(raw: unknown): {
  match: Record<string, string>;
  predicates: Array<{ field: string; operator: string; value: number }>;
  logic: 'AND' | 'OR';
} {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    match: (c.match ?? {}) as Record<string, string>,
    predicates: (c.predicates ?? []) as Array<{ field: string; operator: string; value: number }>,
    logic: ((c.logic as string) ?? 'AND') as 'AND' | 'OR',
  };
}

export function asContentConfig(raw: unknown): ContentConfig {
  return (raw ?? {}) as ContentConfig;
}
