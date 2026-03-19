import { describe, it, expect } from 'vitest';
import { DefaultTriggerEvaluator, matchesEvent, validateContentConfig } from '../../src/domain/trigger-evaluator.js';
import type { DetectedEvent } from '../../src/domain/detected-event.js';

const goldEvent: DetectedEvent = {
  source: 'coingecko',
  type: 'price-update',
  verticalId: 'v1',
  observedAt: new Date(),
  data: {
    instrument: 'BTC/USD',
    baseCurrency: 'BTC',
    quoteCurrency: 'USD',
    price: 74141,
    previousPrice: 74100,
    changePct: 1.29,
  },
  rawPayload: {},
};

describe('matchesEvent', () => {
  it('matches top-level source field', () => {
    expect(matchesEvent({ source: 'coingecko' }, goldEvent)).toBe(true);
  });

  it('does not match different source', () => {
    expect(matchesEvent({ source: 'exchangerate' }, goldEvent)).toBe(false);
  });

  it('matches data-level field (instrument)', () => {
    expect(matchesEvent({ instrument: 'BTC/USD' }, goldEvent)).toBe(true);
  });

  it('matches mix of top-level and data fields', () => {
    expect(matchesEvent({ source: 'coingecko', instrument: 'BTC/USD' }, goldEvent)).toBe(true);
  });

  it('matches when match is empty (match any)', () => {
    expect(matchesEvent({}, goldEvent)).toBe(true);
  });

  it('matches verticalId as top-level field', () => {
    expect(matchesEvent({ verticalId: 'v1' }, goldEvent)).toBe(true);
  });
});

describe('DefaultTriggerEvaluator', () => {
  const evaluator = new DefaultTriggerEvaluator();
  const validConfig = { templateSelection: 'named' as const, templateNames: ['x'] };

  it('fires when single predicate satisfied and cooldown expired', () => {
    expect(evaluator.evaluate({
      condition: { match: { source: 'coingecko' }, predicates: [{ field: 'changePct', operator: 'gt', value: 1.0 }], logic: 'AND' },
      fireMode: 'threshold_cross', cooldownMs: 3600000, lastFiredAt: null, contentConfig: validConfig,
    }, goldEvent)).toBe(true);
  });

  it('does not fire when within cooldown', () => {
    expect(evaluator.evaluate({
      condition: { match: { source: 'coingecko' }, predicates: [{ field: 'changePct', operator: 'gt', value: 1.0 }], logic: 'AND' },
      fireMode: 'threshold_cross', cooldownMs: 3600000, lastFiredAt: new Date(), contentConfig: validConfig,
    }, goldEvent)).toBe(false);
  });

  it('does not fire when predicate not met', () => {
    expect(evaluator.evaluate({
      condition: { match: {}, predicates: [{ field: 'changePct', operator: 'gt', value: 5.0 }], logic: 'AND' },
      fireMode: 'threshold_cross', cooldownMs: 0, lastFiredAt: null, contentConfig: validConfig,
    }, goldEvent)).toBe(false);
  });

  it('AND logic — all predicates must pass', () => {
    expect(evaluator.evaluate({
      condition: { match: {}, predicates: [
        { field: 'price', operator: 'gt', value: 70000 },
        { field: 'changePct', operator: 'gt', value: 1.0 },
      ], logic: 'AND' },
      fireMode: 'threshold_cross', cooldownMs: 0, lastFiredAt: null, contentConfig: validConfig,
    }, goldEvent)).toBe(true);
  });

  it('AND logic — fails if one predicate fails', () => {
    expect(evaluator.evaluate({
      condition: { match: {}, predicates: [
        { field: 'price', operator: 'gt', value: 70000 },
        { field: 'changePct', operator: 'gt', value: 5.0 },
      ], logic: 'AND' },
      fireMode: 'threshold_cross', cooldownMs: 0, lastFiredAt: null, contentConfig: validConfig,
    }, goldEvent)).toBe(false);
  });

  it('threshold_cross — does NOT re-fire while condition remains true', () => {
    expect(evaluator.evaluate({
      condition: { match: {}, predicates: [{ field: 'changePct', operator: 'gt', value: 1.0 }], logic: 'AND' },
      fireMode: 'threshold_cross', cooldownMs: 0, lastFiredAt: null,
      lastPredicateResult: true, // was already true — no transition
      contentConfig: validConfig,
    }, goldEvent)).toBe(false);
  });

  it('threshold_cross — fires on false→true transition', () => {
    expect(evaluator.evaluate({
      condition: { match: {}, predicates: [{ field: 'changePct', operator: 'gt', value: 1.0 }], logic: 'AND' },
      fireMode: 'threshold_cross', cooldownMs: 0, lastFiredAt: null,
      lastPredicateResult: false, // was false, now true — transition!
      contentConfig: validConfig,
    }, goldEvent)).toBe(true);
  });

  it('threshold_cross — fires on first evaluation (undefined→true)', () => {
    expect(evaluator.evaluate({
      condition: { match: {}, predicates: [{ field: 'changePct', operator: 'gt', value: 1.0 }], logic: 'AND' },
      fireMode: 'threshold_cross', cooldownMs: 0, lastFiredAt: null,
      lastPredicateResult: undefined, // first evaluation
      contentConfig: validConfig,
    }, goldEvent)).toBe(true);
  });

  it('OR logic — fires if any predicate passes', () => {
    expect(evaluator.evaluate({
      condition: { match: {}, predicates: [
        { field: 'changePct', operator: 'gt', value: 5.0 },
        { field: 'price', operator: 'gt', value: 70000 },
      ], logic: 'OR' },
      fireMode: 'threshold_cross', cooldownMs: 0, lastFiredAt: null, contentConfig: validConfig,
    }, goldEvent)).toBe(true);
  });

  it('does not fire for scheduled fire_mode', () => {
    expect(evaluator.evaluate({
      condition: { match: {}, predicates: [], logic: 'AND' },
      fireMode: 'scheduled', cooldownMs: 0, lastFiredAt: null, contentConfig: validConfig,
    }, goldEvent)).toBe(false);
  });

  it('fires with empty predicates (match-only)', () => {
    expect(evaluator.evaluate({
      condition: { match: { source: 'coingecko' }, predicates: [], logic: 'AND' },
      fireMode: 'every_poll', cooldownMs: 0, lastFiredAt: null, contentConfig: validConfig,
    }, goldEvent)).toBe(true);
  });

  it('supports lt operator', () => {
    expect(evaluator.evaluate({
      condition: { match: {}, predicates: [{ field: 'price', operator: 'lt', value: 100000 }], logic: 'AND' },
      fireMode: 'threshold_cross', cooldownMs: 0, lastFiredAt: null, contentConfig: validConfig,
    }, goldEvent)).toBe(true);
  });
});

describe('validateContentConfig', () => {
  it('accepts valid named config', () => {
    expect(validateContentConfig({ templateSelection: 'named', templateNames: ['a', 'b'] })).toBe(true);
  });

  it('accepts valid random config', () => {
    expect(validateContentConfig({ templateSelection: 'random', templateNames: ['a'] })).toBe(true);
  });

  it('rejects empty templateNames', () => {
    expect(validateContentConfig({ templateSelection: 'named', templateNames: [] })).toBe(false);
  });

  it('rejects missing templateSelection', () => {
    expect(validateContentConfig({ templateNames: ['a'] })).toBe(false);
  });

  it('rejects null', () => {
    expect(validateContentConfig(null)).toBe(false);
  });
});
