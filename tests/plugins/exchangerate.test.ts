import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExchangeRateProvider } from '../../src/plugins/data-sources/exchangerate.js';

describe('ExchangeRateProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns generic DetectedEvents with fields in data', async () => {
    const mockResponse = { rates: { TRY: 38.45, EUR: 0.92 }, base: 'USD' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const provider = new ExchangeRateProvider({
      endpoint: 'https://open.er-api.com/v6/latest',
      base: 'USD',
      symbols: ['TRY', 'EUR'],
    });

    provider.setPreviousRate('USD/TRY', 38.0);
    provider.setPreviousRate('USD/EUR', 0.91);

    const events = await provider.poll('vertical-1');
    expect(events).toHaveLength(2);

    const tryEvent = events.find(e => (e.data as any).instrument === 'USD/TRY')!;
    expect(tryEvent.source).toBe('exchangerate');
    expect(tryEvent.type).toBe('rate-update');
    expect(tryEvent.verticalId).toBe('vertical-1');
    expect(tryEvent.data.price).toBe(38.45);
    expect(tryEvent.data.previousPrice).toBe(38.0);
    expect(tryEvent.data.changePct as number).toBeCloseTo(1.18, 1);
  });

  it('returns empty array on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network'));
    const provider = new ExchangeRateProvider({
      endpoint: 'https://open.er-api.com/v6/latest',
      base: 'USD',
      symbols: ['TRY'],
    });

    const events = await provider.poll('v1');
    expect(events).toEqual([]);
  });
});
