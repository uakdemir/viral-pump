import { describe, it, expect } from 'vitest';
import { getPollingInterval, shouldPoll } from '../../src/shared/metrics-schedules.js';

describe('metrics-schedules', () => {
  it('twitter aggressive phase: 5 min interval', () => {
    expect(getPollingInterval('twitter', 30 * 60_000)).toBe(5 * 60_000);
  });
  it('twitter medium phase: 30 min interval', () => {
    expect(getPollingInterval('twitter', 3 * 60 * 60_000)).toBe(30 * 60_000);
  });
  it('twitter slow phase: 6h interval', () => {
    expect(getPollingInterval('twitter', 2 * 24 * 60 * 60_000)).toBe(6 * 60 * 60_000);
  });
  it('twitter expired: returns null', () => {
    expect(getPollingInterval('twitter', 8 * 24 * 60 * 60_000)).toBeNull();
  });
  it('instagram aggressive phase: 15 min interval', () => {
    expect(getPollingInterval('instagram', 2 * 60 * 60_000)).toBe(15 * 60_000);
  });
  it('unknown platform: returns null', () => {
    expect(getPollingInterval('tiktok', 1000)).toBeNull();
  });
  it('shouldPoll returns true when never polled', () => {
    expect(shouldPoll('twitter', 30 * 60_000, null)).toBe(true);
  });
  it('shouldPoll returns false when polled recently', () => {
    expect(shouldPoll('twitter', 30 * 60_000, 60_000)).toBe(false);
  });
  it('shouldPoll returns true when interval elapsed', () => {
    expect(shouldPoll('twitter', 30 * 60_000, 6 * 60_000)).toBe(true);
  });
});
