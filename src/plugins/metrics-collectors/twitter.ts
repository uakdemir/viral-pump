import type { MetricsCollector, MetricsData } from './types.js';
import { logger } from '../../shared/logger.js';

export class TwitterMetricsCollector implements MetricsCollector {
  async collect(
    platformPostId: string,
    credentials: Record<string, unknown>,
  ): Promise<MetricsData> {
    const bearerToken = credentials.bearerToken as string;
    if (!bearerToken) throw new Error('Twitter bearer token not configured');

    // public_metrics via bearer token: like_count, retweet_count, reply_count, quote_count, bookmark_count
    // NOTE: impression_count (views) requires OAuth user context (non_public_metrics), not available via bearer token.
    // To get views, would need to use OAuth 1.0a user token instead of bearer token.
    const url = `https://api.x.com/2/tweets/${platformPostId}?tweet.fields=public_metrics`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });

    if (res.status === 404) {
      throw Object.assign(new Error(`Tweet not found: ${platformPostId}`), { unrecoverable: true });
    }

    if (res.status === 429) {
      throw Object.assign(new Error('Twitter rate limit exceeded'), { rateLimited: true });
    }

    if (!res.ok) {
      throw new Error(`Twitter API error: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as { data: { public_metrics: Record<string, number> } };
    const pm = data.data.public_metrics;

    logger.debug({ platformPostId, likes: pm.like_count }, 'Twitter metrics collected');

    return {
      // views: NOT available via bearer token (requires OAuth user context for non_public_metrics)
      likes: pm.like_count,
      shares: (pm.retweet_count ?? 0) + (pm.quote_count ?? 0),
      comments: pm.reply_count,
      saves: pm.bookmark_count,
      extra: {
        retweets: pm.retweet_count,
        quotes: pm.quote_count,
        bookmarks: pm.bookmark_count,
      },
    };
  }
}
