import { eq, and, sql } from 'drizzle-orm';
import { posts } from '../shared/schema/posts.js';
import { accounts } from '../shared/schema/accounts.js';
import { metricsSnapshots } from '../shared/schema/metrics-snapshots.js';
import { shouldPoll, PLATFORM_HOURLY_BUDGETS, METRICS_SCHEDULES } from '../shared/metrics-schedules.js';
import type { DB } from '../shared/db.js';
import type { MetricsCollector } from '../plugins/metrics-collectors/types.js';
import type { PluginRegistry } from '../plugins/registry.js';
import type { Config } from '../shared/config.js';

interface MetricsPollerDeps {
  db: DB;
  metricsCollectorRegistry: PluginRegistry<MetricsCollector>;
  config: Config;
  logger: { info: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void; debug: (...args: any[]) => void };
}

// Exported for testing
export function mergeMetrics(existing: Record<string, unknown>, collected: Record<string, unknown>): Record<string, unknown> {
  return { ...existing, ...collected };
}

export function isDryRunPost(platformPostId: string): boolean {
  return platformPostId.startsWith('dry-run-');
}

export function buildCredentials(
  platform: string,
  accountCredentials: Record<string, unknown>,
  config: Config,
): Record<string, unknown> | null {
  switch (platform) {
    case 'twitter':
      if (!config.TWITTER_BEARER_TOKEN) return null;
      return { bearerToken: config.TWITTER_BEARER_TOKEN };
    case 'instagram':
      if (!accountCredentials.accessToken) return null;
      return { accessToken: accountCredentials.accessToken as string };
    default:
      return null;
  }
}

export class MetricsPoller {
  private timer: NodeJS.Timeout | undefined;
  private deps: MetricsPollerDeps;
  private callTimestamps = new Map<string, number[]>(); // rolling window of call timestamps per platform
  private running = false; // reentrancy guard — prevents overlapping cycles

  constructor(deps: MetricsPollerDeps) {
    this.deps = deps;
  }

  start(): void {
    this.timer = setInterval(() => {
      if (this.running) {
        this.deps.logger.debug('Metrics poll cycle still running, skipping');
        return;
      }
      this.pollCycle().catch(err => this.deps.logger.error({ err }, 'Metrics poll cycle failed'));
    }, 60_000);
    this.pollCycle().catch(err => this.deps.logger.error({ err }, 'Initial metrics poll cycle failed'));
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async pollCycle(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      await this.doPollCycle();
    } finally {
      this.running = false;
    }
  }

  private async doPollCycle(): Promise<void> {
    const now = Date.now();
    let postsPolled = 0;
    let postsSkipped = 0;
    let errors = 0;
    const platformsRateLimited = new Set<string>();

    // Compute the global max age across all platforms so we can exclude definitely-expired rows in SQL
    const globalMaxAgeMs = Math.max(...Object.values(METRICS_SCHEDULES).map(s => s.maxAgeMs));
    const oldestEligible = new Date(now - globalMaxAgeMs).toISOString();

    // Query eligible posts — push filters into SQL to avoid scanning historical rows
    const eligiblePosts = await this.deps.db
      .select({
        postId: posts.id,
        platformPostId: posts.platformPostId,
        postedAt: posts.postedAt,
        lastMetricsCollectedAt: posts.lastMetricsCollectedAt,
        currentMetrics: posts.metrics,
        accountId: posts.accountId,
        accountPlatform: accounts.platform,
        accountCredentials: accounts.credentials,
      })
      .from(posts)
      .innerJoin(accounts, eq(posts.accountId, accounts.id))
      .where(and(
        eq(posts.status, 'posted'),
        eq(posts.metricsDisabled, false),
        sql`${posts.platformPostId} IS NOT NULL`,
        sql`${posts.platformPostId} NOT LIKE 'dry-run-%'`,
        sql`${posts.postedAt} >= ${oldestEligible}::timestamptz`,
      ))
      .orderBy(sql`${posts.postedAt} DESC`);

    for (const post of eligiblePosts) {
      if (!post.postedAt) {
        postsSkipped++;
        continue;
      }

      const platform = post.accountPlatform;

      // Skip if platform is rate-limited this cycle
      if (platformsRateLimited.has(platform)) {
        postsSkipped++;
        continue;
      }

      // Check if collector exists
      if (!this.deps.metricsCollectorRegistry.names().includes(platform)) {
        postsSkipped++;
        continue;
      }

      // Check decay schedule
      const postAgeMs = now - post.postedAt.getTime();
      const msSinceLastPoll = post.lastMetricsCollectedAt
        ? now - post.lastMetricsCollectedAt.getTime()
        : null;

      if (!shouldPoll(platform, postAgeMs, msSinceLastPoll)) {
        postsSkipped++;
        continue;
      }

      // Check rolling hourly budget
      const budget = PLATFORM_HOURLY_BUDGETS[platform];
      if (budget) {
        // Evict timestamps older than 1 hour
        const timestamps = this.callTimestamps.get(platform) ?? [];
        const oneHourAgo = now - 60 * 60_000;
        const recentCalls = timestamps.filter(t => t > oneHourAgo);
        this.callTimestamps.set(platform, recentCalls);

        if (recentCalls.length + budget.callsPerPost > budget.budget) {
          postsSkipped++;
          continue;
        }
      }

      // Build credentials
      const accountCreds = (post.accountCredentials ?? {}) as Record<string, unknown>;
      const credentials = buildCredentials(platform, accountCreds, this.deps.config);
      if (!credentials) {
        this.deps.logger.debug({ platform, postId: post.postId }, 'Missing credentials, skipping metrics collection');
        postsSkipped++;
        continue;
      }

      // Collect metrics
      try {
        const collector = this.deps.metricsCollectorRegistry.resolve(platform, {});
        const collected = await collector.collect(post.platformPostId!, credentials);

        // Track API calls in rolling window
        if (budget) {
          const timestamps = this.callTimestamps.get(platform) ?? [];
          for (let i = 0; i < budget.callsPerPost; i++) {
            timestamps.push(Date.now());
          }
          this.callTimestamps.set(platform, timestamps);
        }

        // Merge with existing
        const existingMetrics = (post.currentMetrics ?? {}) as Record<string, unknown>;
        const mergedMetrics = mergeMetrics(existingMetrics, collected as Record<string, unknown>);

        // Store snapshot
        await this.deps.db.insert(metricsSnapshots).values({
          postId: post.postId,
          metrics: mergedMetrics,
        });

        // Update post with latest
        await this.deps.db.update(posts).set({
          metrics: mergedMetrics,
          lastMetricsCollectedAt: new Date(),
        }).where(eq(posts.id, post.postId));

        postsPolled++;
      } catch (err: any) {
        errors++;

        if (err.unrecoverable) {
          this.deps.logger.warn({ postId: post.postId, err: err.message }, 'Unrecoverable metrics error — disabling collection');
          await this.deps.db.update(posts).set({ metricsDisabled: true })
            .where(eq(posts.id, post.postId));
          continue;
        }

        if (err.rateLimited) {
          this.deps.logger.warn({ platform }, 'Rate limited — skipping platform for rest of cycle');
          platformsRateLimited.add(platform);
          continue;
        }

        this.deps.logger.warn({ postId: post.postId, err: err.message }, 'Metrics collection failed, will retry next cycle');
      }
    }

    if (postsPolled > 0 || errors > 0) {
      this.deps.logger.info({ postsPolled, postsSkipped, errors }, 'Metrics poll cycle complete');
    }
  }
}
