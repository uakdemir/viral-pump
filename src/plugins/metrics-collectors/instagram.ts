import type { MetricsCollector, MetricsData } from './types.js';
import { logger } from '../../shared/logger.js';

export class InstagramMetricsCollector implements MetricsCollector {
  async collect(platformPostId: string, credentials: Record<string, unknown>): Promise<MetricsData> {
    const accessToken = credentials.accessToken as string;
    if (!accessToken) throw new Error('Instagram access token not configured');

    // Check for rate limit and unrecoverable errors on first call
    const basicRes = await fetch(
      `https://graph.instagram.com/v21.0/${platformPostId}?fields=like_count,comments_count&access_token=${accessToken}`,
    );

    if (basicRes.status === 404) {
      throw Object.assign(new Error(`Instagram media not found: ${platformPostId}`), { unrecoverable: true });
    }
    if (basicRes.status === 429) {
      throw Object.assign(new Error('Instagram rate limit exceeded'), { rateLimited: true });
    }
    if (basicRes.status === 401 || basicRes.status === 403) {
      throw new Error(`Instagram auth error: ${basicRes.status} ${await basicRes.text()}`);
    }
    if (!basicRes.ok) {
      throw new Error(`Instagram API error: ${basicRes.status} ${await basicRes.text()}`);
    }

    const basicData = (await basicRes.json()) as { like_count: number; comments_count: number };

    const result: MetricsData = {
      likes: basicData.like_count,
      comments: basicData.comments_count,
    };

    // Attempt insights (may fail for posts < 24h old)
    try {
      const insightsRes = await fetch(
        `https://graph.instagram.com/v21.0/${platformPostId}/insights?metric=impressions,reach,saved,shares&access_token=${accessToken}`,
      );

      if (insightsRes.status === 429) {
        throw Object.assign(new Error('Instagram rate limit exceeded'), { rateLimited: true });
      }

      if (insightsRes.status === 401 || insightsRes.status === 403) {
        throw new Error(`Instagram insights auth error: ${insightsRes.status}`);
      }

      if (insightsRes.status >= 500) {
        throw new Error(`Instagram insights server error: ${insightsRes.status}`);
      }

      if (insightsRes.ok) {
        const insightsData = (await insightsRes.json()) as {
          data: Array<{ name: string; values: Array<{ value: number }> }>;
        };

        for (const metric of insightsData.data) {
          const value = metric.values?.[0]?.value;
          if (value == null) continue;
          switch (metric.name) {
            case 'impressions': result.impressions = value; break;
            case 'reach': result.reach = value; break;
            case 'saved': result.saves = value; break;
            case 'shares': result.shares = value; break;
          }
        }
      }
      // 400 = insights not available yet (delayed) — return partial, that's fine
    } catch (err: any) {
      // Re-throw rate limit and auth errors — don't swallow them as "delayed insights"
      if (err.rateLimited || err.message?.includes('auth')) throw err;
      // For other insight failures, log and return partial data
      logger.debug({ platformPostId, err: err.message }, 'Instagram insights not available, returning partial');
    }

    logger.debug({ platformPostId, likes: result.likes, impressions: result.impressions }, 'Instagram metrics collected');

    return result;
  }
}
