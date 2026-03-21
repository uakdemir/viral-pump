import { describe, it, expect } from 'vitest';
import { mergeMetrics, isDryRunPost, buildCredentials } from '../../src/worker/metrics-poller.js';

describe('mergeMetrics', () => {
  it('new values overwrite existing', () => {
    expect(mergeMetrics({ views: 100, likes: 5 }, { views: 200, likes: 10 })).toEqual({
      views: 200,
      likes: 10,
    });
  });
  it('missing fields preserve existing values', () => {
    expect(mergeMetrics({ views: 100, likes: 5, shares: 3 }, { views: 200 })).toEqual({
      views: 200,
      likes: 5,
      shares: 3,
    });
  });
  it('new fields added to existing', () => {
    expect(mergeMetrics({ views: 100 }, { likes: 5 })).toEqual({ views: 100, likes: 5 });
  });
  it('empty existing works', () => {
    expect(mergeMetrics({}, { views: 100 })).toEqual({ views: 100 });
  });
});

describe('isDryRunPost', () => {
  it('returns true for dry-run prefix', () => {
    expect(isDryRunPost('dry-run-abc123')).toBe(true);
  });
  it('returns false for real tweet ID', () => {
    expect(isDryRunPost('1234567890')).toBe(false);
  });
  it('returns false for empty string', () => {
    expect(isDryRunPost('')).toBe(false);
  });
});

describe('buildCredentials', () => {
  it('returns bearerToken for twitter', () => {
    expect(buildCredentials('twitter', {}, { TWITTER_BEARER_TOKEN: 'bt-123' } as any)).toEqual({
      bearerToken: 'bt-123',
    });
  });
  it('returns accessToken for instagram', () => {
    expect(buildCredentials('instagram', { accessToken: 'ig-tok' }, {} as any)).toEqual({
      accessToken: 'ig-tok',
    });
  });
  it('returns null for twitter without bearer token', () => {
    expect(buildCredentials('twitter', {}, {} as any)).toBeNull();
  });
  it('returns null for instagram without access token', () => {
    expect(buildCredentials('instagram', {}, {} as any)).toBeNull();
  });
  it('returns null for unknown platform', () => {
    expect(buildCredentials('tiktok', {}, {} as any)).toBeNull();
  });
});
