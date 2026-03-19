import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoinGeckoProvider } from '../../src/plugins/data-sources/coingecko.js';

describe('CoinGeckoProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns generic DetectedEvent with fields in data', async () => {
    const mockResponse = { gold: { usd: 2350 } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    const provider = new CoinGeckoProvider({
      endpoint: 'https://api.coingecko.com/api/v3/simple/price',
      assets: { gold: 'XAU' },
      vsCurrencies: ['usd'],
    });

    provider.setPreviousPrice('XAU/USD', 2320);

    const events = await provider.poll('vertical-1');
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('coingecko');
    expect(events[0].type).toBe('price-update');
    expect(events[0].verticalId).toBe('vertical-1');
    expect(events[0].data.instrument).toBe('XAU/USD');
    expect(events[0].data.price).toBe(2350);
    expect(events[0].data.previousPrice).toBe(2320);
    expect((events[0].data.changePct as number)).toBeCloseTo(1.29, 1);
  });

  it('returns empty array on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network'));
    const provider = new CoinGeckoProvider({
      endpoint: 'https://api.coingecko.com/api/v3/simple/price',
      assets: { gold: 'XAU' },
      vsCurrencies: ['usd'],
    });

    const events = await provider.poll('v1');
    expect(events).toEqual([]);
  });

  it('returns empty array on non-200 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('error', { status: 429 })
    );

    const provider = new CoinGeckoProvider({
      endpoint: 'https://api.coingecko.com/api/v3/simple/price',
      assets: { gold: 'XAU' },
      vsCurrencies: ['usd'],
    });

    const events = await provider.poll('v1');
    expect(events).toEqual([]);
  });
});
