import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TwitterMetricsCollector } from '../../../src/plugins/metrics-collectors/twitter.js';

describe('TwitterMetricsCollector', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('collects public metrics from tweet (bearer token — no views)', async () => {
    const mockResponse = {
      data: {
        public_metrics: {
          like_count: 23,
          retweet_count: 5,
          reply_count: 3,
          quote_count: 2,
          bookmark_count: 7,
        },
      },
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );
    const collector = new TwitterMetricsCollector();
    const result = await collector.collect('tweet-123', { bearerToken: 'test-token' });
    // views not available via bearer token (requires OAuth user context)
    expect(result.views).toBeUndefined();
    expect(result.likes).toBe(23);
    expect(result.shares).toBe(7); // retweets + quotes
    expect(result.comments).toBe(3);
    expect(result.saves).toBe(7); // bookmarks
  });

  it('throws unrecoverable on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
    const collector = new TwitterMetricsCollector();
    try {
      await collector.collect('bad-id', { bearerToken: 'test' });
    } catch (err: any) {
      expect(err.unrecoverable).toBe(true);
    }
  });

  it('throws rateLimited on 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Rate limited', { status: 429 }),
    );
    const collector = new TwitterMetricsCollector();
    try {
      await collector.collect('tweet-123', { bearerToken: 'test' });
    } catch (err: any) {
      expect(err.rateLimited).toBe(true);
    }
  });

  it('throws on missing bearer token', async () => {
    const collector = new TwitterMetricsCollector();
    await expect(collector.collect('tweet-123', {})).rejects.toThrow(/bearer/i);
  });
});
