import { describe, it, expect } from 'vitest';
import { evaluateRule, matchesEvent } from '../../src/domain/trigger-evaluator.js';
import type { DetectedEvent } from '../../src/domain/detected-event.js';

const goldEvent: DetectedEvent = {
  source: 'coingecko',
  instrument: 'XAU/USD',
  baseCurrency: 'XAU',
  quoteCurrency: 'USD',
  price: 2350,
  previousPrice: 2320,
  changePct: 1.29,
  observedAt: new Date(),
  rawPayload: {},
};

describe('matchesEvent', () => {
  it('matches when all match fields align', () => {
    const condition = { match: { source: 'coingecko', instrument: 'XAU/USD' }, predicate: { field: 'changePct', operator: 'gt', value: 1.0 } };
    expect(matchesEvent(condition, goldEvent)).toBe(true);
  });

  it('does not match different source', () => {
    const condition = { match: { source: 'exchangerate' }, predicate: { field: 'changePct', operator: 'gt', value: 1.0 } };
    expect(matchesEvent(condition, goldEvent)).toBe(false);
  });

  it('matches when match is empty (match any)', () => {
    const condition = { match: {}, predicate: { field: 'changePct', operator: 'gt', value: 1.0 } };
    expect(matchesEvent(condition, goldEvent)).toBe(true);
  });
});

describe('evaluateRule', () => {
  it('fires when predicate is satisfied and cooldown expired', () => {
    const rule = {
      condition: { match: { source: 'coingecko' }, predicate: { field: 'changePct', operator: 'gt', value: 1.0 } },
      fireMode: 'threshold_cross' as const,
      cooldownMs: 3600000,
      lastFiredAt: null,
    };
    expect(evaluateRule(rule, goldEvent)).toBe(true);
  });

  it('does not fire when within cooldown', () => {
    const rule = {
      condition: { match: { source: 'coingecko' }, predicate: { field: 'changePct', operator: 'gt', value: 1.0 } },
      fireMode: 'threshold_cross' as const,
      cooldownMs: 3600000,
      lastFiredAt: new Date(),
    };
    expect(evaluateRule(rule, goldEvent)).toBe(false);
  });

  it('does not fire when predicate not met', () => {
    const rule = {
      condition: { match: {}, predicate: { field: 'changePct', operator: 'gt', value: 5.0 } },
      fireMode: 'threshold_cross' as const,
      cooldownMs: 0,
      lastFiredAt: null,
    };
    expect(evaluateRule(rule, goldEvent)).toBe(false);
  });

  it('supports lt operator', () => {
    const rule = {
      condition: { match: {}, predicate: { field: 'price', operator: 'lt', value: 3000 } },
      fireMode: 'threshold_cross' as const,
      cooldownMs: 0,
      lastFiredAt: null,
    };
    expect(evaluateRule(rule, goldEvent)).toBe(true);
  });
});
