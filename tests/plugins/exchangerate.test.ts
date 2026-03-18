import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExchangeRateProvider } from '../../src/plugins/data-sources/exchangerate.js';

describe('ExchangeRateProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns DetectedEvents for forex rates', async () => {
    const mockResponse = { rates: { TRY: 38.45, EUR: 0.92 }, base: 'USD' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    const provider = new ExchangeRateProvider({
      endpoint: 'https://api.exchangerate.host/latest',
      base: 'USD',
      symbols: ['TRY', 'EUR'],
    });

    provider.setPreviousRate('USD/TRY', 38.0);
    provider.setPreviousRate('USD/EUR', 0.91);

    const events = await provider.poll();
    expect(events).toHaveLength(2);

    const tryEvent = events.find(e => e.instrument === 'USD/TRY')!;
    expect(tryEvent.source).toBe('exchangerate');
    expect(tryEvent.price).toBe(38.45);
    expect(tryEvent.previousPrice).toBe(38.0);
    expect(tryEvent.changePct).toBeCloseTo(1.18, 1);
  });

  it('returns empty array on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network'));
    const provider = new ExchangeRateProvider({
      endpoint: 'https://api.exchangerate.host/latest',
      base: 'USD',
      symbols: ['TRY'],
    });

    const events = await provider.poll();
    expect(events).toEqual([]);
  });
});
