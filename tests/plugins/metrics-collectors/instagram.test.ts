import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstagramMetricsCollector } from '../../../src/plugins/metrics-collectors/instagram.js';

describe('InstagramMetricsCollector', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('collects basic metrics + insights from two API calls', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            like_count: 45,
            comments_count: 7,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { name: 'impressions', values: [{ value: 890 }] },
              { name: 'reach', values: [{ value: 650 }] },
              { name: 'saved', values: [{ value: 12 }] },
              { name: 'shares', values: [{ value: 3 }] },
            ],
          }),
          { status: 200 },
        ),
      );

    const collector = new InstagramMetricsCollector();
    const result = await collector.collect('media-123', { accessToken: 'test-token' });
    expect(result.likes).toBe(45);
    expect(result.comments).toBe(7);
    expect(result.impressions).toBe(890);
    expect(result.reach).toBe(650);
    expect(result.saves).toBe(12);
    expect(result.shares).toBe(3);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns partial data when insights not available (400)', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            like_count: 45,
            comments_count: 7,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { message: 'Insights are not available', code: 100 },
          }),
          { status: 400 },
        ),
      );

    const collector = new InstagramMetricsCollector();
    const result = await collector.collect('media-123', { accessToken: 'test-token' });
    expect(result.likes).toBe(45);
    expect(result.comments).toBe(7);
    expect(result.impressions).toBeUndefined();
  });

  it('throws on missing access token', async () => {
    const collector = new InstagramMetricsCollector();
    await expect(collector.collect('media-123', {})).rejects.toThrow(/access.*token/i);
  });

  it('throws unrecoverable on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
    const collector = new InstagramMetricsCollector();
    try {
      await collector.collect('bad-id', { accessToken: 'test' });
    } catch (err: any) {
      expect(err.unrecoverable).toBe(true);
    }
  });

  it('throws on 401 auth error', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            like_count: 45,
            comments_count: 7,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

    const collector = new InstagramMetricsCollector();
    await expect(collector.collect('media-123', { accessToken: 'bad' })).rejects.toThrow();
  });

  it('throws rateLimited on 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Too Many Requests', { status: 429 }),
    );
    const collector = new InstagramMetricsCollector();
    try {
      await collector.collect('media-123', { accessToken: 'test' });
    } catch (err: any) {
      expect(err.rateLimited).toBe(true);
    }
  });

  it('throws on 500 server error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Server Error', { status: 500 }),
    );
    const collector = new InstagramMetricsCollector();
    await expect(collector.collect('media-123', { accessToken: 'test' })).rejects.toThrow();
  });
});
