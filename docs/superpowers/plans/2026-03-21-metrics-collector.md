# Metrics Collector — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect engagement metrics from Twitter and Instagram APIs using per-platform decay schedules, store time-series snapshots, and display in the dashboard with filters and engagement curve charts.

**Architecture:** A `MetricsPoller` class runs on a 60-second loop in the worker, queries due posts based on per-platform decay schedules, calls platform-specific `MetricsCollector` plugins, stores merged metrics in both `metrics_snapshots` (time-series) and `posts.metrics` (latest). Dashboard enhanced with inline metrics, filters (platform/vertical/date), and recharts engagement curves.

**Tech Stack:** TypeScript, Drizzle ORM, X API v2 (bearer token), Instagram Graph API, recharts (React charting)

**Spec:** `docs/superpowers/specs/2026-03-21-metrics-collector-design.md`

---

## File Structure

```
src/
├── shared/
│   ├── config.ts                                # Add TWITTER_BEARER_TOKEN
│   ├── metrics-schedules.ts                     # NEW: decay schedule constants + phase resolver
│   ├── schema/
│   │   ├── metrics-snapshots.ts                 # NEW: metrics_snapshots table
│   │   ├── posts.ts                             # Add lastMetricsCollectedAt, metricsDisabled, updatedAt
│   │   ├── accounts.ts                          # Add updatedAt
│   │   ├── data-sources.ts                      # Add updatedAt
│   │   ├── trigger-rules.ts                     # Add updatedAt
│   │   ├── content-items.ts                     # Add updatedAt
│   │   ├── job-queue.ts                         # Add updatedAt
│   │   └── index.ts                             # Export metricsSnapshots
├── plugins/
│   └── metrics-collectors/
│       ├── types.ts                             # NEW: MetricsCollector interface, MetricsData
│       ├── twitter.ts                           # NEW: X API v2 public_metrics
│       └── instagram.ts                         # NEW: Graph API insights
├── worker/
│   ├── metrics-poller.ts                        # NEW: polling loop + decay logic + rate limiting
│   └── index.ts                                 # Start MetricsPoller
└── web/
    ├── api/
    │   ├── posts.ts                             # Add filters + summary param
    │   └── metrics.ts                           # NEW: GET /api/posts/:id/metrics-history
    └── dashboard/
        └── src/
            ├── api.ts                           # Add fetchMetricsHistory, filter params
            ├── pages/PostMonitor.tsx             # Inline metrics, filters, chart expand
            └── components/MetricsChart.tsx       # NEW: recharts engagement curve

tests/
├── shared/
│   └── metrics-schedules.test.ts                # NEW: decay phase resolution
├── plugins/
│   └── metrics-collectors/
│       ├── twitter.test.ts                      # NEW: mocked API
│       └── instagram.test.ts                    # NEW: mocked API
└── worker/
    └── metrics-poller.test.ts                   # NEW: polling logic tests
```

---

## Task 1: Schema Changes + Migration

**Files:**
- Create: `src/shared/schema/metrics-snapshots.ts`
- Modify: `src/shared/schema/posts.ts`
- Modify: `src/shared/schema/accounts.ts`, `data-sources.ts`, `trigger-rules.ts`, `content-items.ts`, `job-queue.ts`
- Modify: `src/shared/schema/index.ts`
- Modify: `src/shared/config.ts`

- [ ] **Step 1: Create metrics-snapshots schema**

```typescript
// src/shared/schema/metrics-snapshots.ts
import { pgTable, uuid, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { posts } from './posts.js';

export const metricsSnapshots = pgTable('metrics_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull().references(() => posts.id),
  collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
  metrics: jsonb('metrics').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_metrics_snapshots_post').on(table.postId, table.collectedAt),
]);
```

- [ ] **Step 2: Add columns to posts schema**

```typescript
// Add to src/shared/schema/posts.ts
lastMetricsCollectedAt: timestamp('last_metrics_collected_at', { withTimezone: true }),
metricsDisabled: boolean('metrics_disabled').notNull().default(false),
updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
```

- [ ] **Step 3: Add `updatedAt` to all tables missing it**

Add to `accounts.ts`, `data-sources.ts`, `trigger-rules.ts`, `content-items.ts`, `job-queue.ts`:

```typescript
updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
```

- [ ] **Step 4: Export metricsSnapshots from index.ts**

```typescript
export { metricsSnapshots } from './metrics-snapshots.js';
```

- [ ] **Step 5: Add TWITTER_BEARER_TOKEN to config.ts**

```typescript
TWITTER_BEARER_TOKEN: z.string().optional(),
```

- [ ] **Step 6: Add TWITTER_BEARER_TOKEN to .env.example**

```env
TWITTER_BEARER_TOKEN=...  # app-level bearer token for reading tweet metrics
```

- [ ] **Step 7: Generate and run migration**

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

- [ ] **Step 8: Verify**

```bash
npx tsc --noEmit
psql $VIRAL_DATABASE_URL -c "\dt metrics_snapshots"
psql $VIRAL_DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'posts' AND column_name IN ('last_metrics_collected_at', 'metrics_disabled', 'updated_at');"
```

- [ ] **Step 9: Commit**

```bash
git add src/shared/ drizzle/ .env.example
# Commit: "feat(sp2): schema — metrics_snapshots table, posts.metricsDisabled, updated_at on all tables"
```

---

## Task 2: Decay Schedule Config + Resolver

**Files:**
- Create: `src/shared/metrics-schedules.ts`
- Test: `tests/shared/metrics-schedules.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/shared/metrics-schedules.test.ts
import { describe, it, expect } from 'vitest';
import { getPollingInterval, shouldPoll, METRICS_SCHEDULES } from '../../src/shared/metrics-schedules.js';

describe('metrics-schedules', () => {
  it('twitter aggressive phase: 5 min interval', () => {
    const interval = getPollingInterval('twitter', 30 * 60_000); // 30 min old post
    expect(interval).toBe(5 * 60_000);
  });

  it('twitter medium phase: 30 min interval', () => {
    const interval = getPollingInterval('twitter', 3 * 60 * 60_000); // 3h old
    expect(interval).toBe(30 * 60_000);
  });

  it('twitter slow phase: 6h interval', () => {
    const interval = getPollingInterval('twitter', 2 * 24 * 60 * 60_000); // 2 days old
    expect(interval).toBe(6 * 60 * 60_000);
  });

  it('twitter expired: returns null', () => {
    const interval = getPollingInterval('twitter', 8 * 24 * 60 * 60_000); // 8 days old
    expect(interval).toBeNull();
  });

  it('instagram aggressive phase: 15 min interval', () => {
    const interval = getPollingInterval('instagram', 2 * 60 * 60_000); // 2h old
    expect(interval).toBe(15 * 60_000);
  });

  it('unknown platform: returns null', () => {
    expect(getPollingInterval('tiktok', 1000)).toBeNull();
  });

  it('shouldPoll returns true when never polled', () => {
    expect(shouldPoll('twitter', 30 * 60_000, null)).toBe(true);
  });

  it('shouldPoll returns false when polled recently', () => {
    expect(shouldPoll('twitter', 30 * 60_000, 60_000)).toBe(false); // polled 1 min ago, need 5 min
  });

  it('shouldPoll returns true when interval elapsed', () => {
    expect(shouldPoll('twitter', 30 * 60_000, 6 * 60_000)).toBe(true); // polled 6 min ago, need 5 min
  });
});
```

- [ ] **Step 2: Implement metrics-schedules.ts**

```typescript
// src/shared/metrics-schedules.ts
export interface DecayPhase {
  durationMs: number;
  intervalMs: number;
}

export interface MetricsSchedule {
  phases: DecayPhase[];
  maxAgeMs: number;
}

export const METRICS_SCHEDULES: Record<string, MetricsSchedule> = {
  twitter: {
    phases: [
      { durationMs: 2 * 60 * 60_000, intervalMs: 5 * 60_000 },
      { durationMs: 22 * 60 * 60_000, intervalMs: 30 * 60_000 },
      { durationMs: 6 * 24 * 60 * 60_000, intervalMs: 6 * 60 * 60_000 },
    ],
    maxAgeMs: 7 * 24 * 60 * 60_000,
  },
  instagram: {
    phases: [
      { durationMs: 6 * 60 * 60_000, intervalMs: 15 * 60_000 },
      { durationMs: 42 * 60 * 60_000, intervalMs: 60 * 60_000 },
      { durationMs: 12 * 24 * 60 * 60_000, intervalMs: 6 * 60 * 60_000 },
    ],
    maxAgeMs: 30 * 24 * 60 * 60_000,
  },
};

export const PLATFORM_HOURLY_BUDGETS: Record<string, { budget: number; callsPerPost: number }> = {
  twitter: { budget: 1200, callsPerPost: 1 },
  instagram: { budget: 200, callsPerPost: 2 },
};

export function getPollingInterval(platform: string, postAgeMs: number): number | null {
  const schedule = METRICS_SCHEDULES[platform];
  if (!schedule) return null;
  if (postAgeMs >= schedule.maxAgeMs) return null;

  let elapsed = 0;
  for (const phase of schedule.phases) {
    if (postAgeMs < elapsed + phase.durationMs) {
      return phase.intervalMs;
    }
    elapsed += phase.durationMs;
  }
  return null;
}

export function shouldPoll(
  platform: string,
  postAgeMs: number,
  msSinceLastPoll: number | null,
): boolean {
  const interval = getPollingInterval(platform, postAgeMs);
  if (interval === null) return false;
  if (msSinceLastPoll === null) return true;
  return msSinceLastPoll >= interval;
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/shared/metrics-schedules.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/shared/metrics-schedules.ts tests/shared/metrics-schedules.test.ts
# Commit: "feat(sp2): decay schedule config with phase resolver"
```

---

## Task 3: MetricsCollector Interface + Twitter Implementation

**Files:**
- Create: `src/plugins/metrics-collectors/types.ts`
- Create: `src/plugins/metrics-collectors/twitter.ts`
- Test: `tests/plugins/metrics-collectors/twitter.test.ts`

- [ ] **Step 1: Create interface**

```typescript
// src/plugins/metrics-collectors/types.ts
export interface MetricsData {
  views?: number;
  likes?: number;
  shares?: number;
  comments?: number;
  saves?: number;
  clicks?: number;
  reach?: number;
  impressions?: number;
  extra?: Record<string, unknown>;
}

export interface MetricsCollector {
  collect(platformPostId: string, credentials: Record<string, unknown>): Promise<MetricsData>;
}
```

- [ ] **Step 2: Write Twitter collector tests**

```typescript
// tests/plugins/metrics-collectors/twitter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TwitterMetricsCollector } from '../../../src/plugins/metrics-collectors/twitter.js';

describe('TwitterMetricsCollector', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('collects public metrics from tweet', async () => {
    const mockResponse = {
      data: {
        public_metrics: {
          impression_count: 1240,
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

    expect(result.views).toBe(1240);
    expect(result.likes).toBe(23);
    expect(result.shares).toBe(7); // retweets + quotes
    expect(result.comments).toBe(3);
    expect(result.saves).toBe(7);
  });

  it('throws on API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Not Found', { status: 404 }),
    );

    const collector = new TwitterMetricsCollector();
    await expect(collector.collect('bad-id', { bearerToken: 'test' }))
      .rejects.toThrow();
  });

  it('throws on missing bearer token', async () => {
    const collector = new TwitterMetricsCollector();
    await expect(collector.collect('tweet-123', {}))
      .rejects.toThrow(/bearer/i);
  });
});
```

- [ ] **Step 3: Implement Twitter collector**

```typescript
// src/plugins/metrics-collectors/twitter.ts
import type { MetricsCollector, MetricsData } from './types.js';
import { logger } from '../../shared/logger.js';

export class TwitterMetricsCollector implements MetricsCollector {
  async collect(platformPostId: string, credentials: Record<string, unknown>): Promise<MetricsData> {
    const bearerToken = credentials.bearerToken as string;
    if (!bearerToken) throw new Error('Twitter bearer token not configured');

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

    return {
      views: pm.impression_count,
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
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/plugins/metrics-collectors/twitter.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/plugins/metrics-collectors/ tests/plugins/metrics-collectors/twitter.test.ts
# Commit: "feat(sp2): MetricsCollector interface + Twitter implementation"
```

---

## Task 4: Instagram Metrics Collector

**Files:**
- Create: `src/plugins/metrics-collectors/instagram.ts`
- Test: `tests/plugins/metrics-collectors/instagram.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/plugins/metrics-collectors/instagram.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstagramMetricsCollector } from '../../../src/plugins/metrics-collectors/instagram.js';

describe('InstagramMetricsCollector', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('collects basic metrics + insights from two API calls', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        like_count: 45, comments_count: 7,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [
          { name: 'impressions', values: [{ value: 890 }] },
          { name: 'reach', values: [{ value: 650 }] },
          { name: 'saved', values: [{ value: 12 }] },
          { name: 'shares', values: [{ value: 3 }] },
        ],
      }), { status: 200 }));

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

  it('returns partial data when insights are not yet available (400)', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        like_count: 45, comments_count: 7,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: 'Insights are not available', code: 100 }
      }), { status: 400 }));

    const collector = new InstagramMetricsCollector();
    const result = await collector.collect('media-123', { accessToken: 'test-token' });

    expect(result.likes).toBe(45);
    expect(result.comments).toBe(7);
    expect(result.impressions).toBeUndefined();
    expect(result.reach).toBeUndefined();
  });

  it('throws on missing access token', async () => {
    const collector = new InstagramMetricsCollector();
    await expect(collector.collect('media-123', {}))
      .rejects.toThrow(/access.*token/i);
  });

  it('throws unrecoverable on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Not Found', { status: 404 }),
    );
    const collector = new InstagramMetricsCollector();
    try {
      await collector.collect('bad-id', { accessToken: 'test' });
    } catch (err: any) {
      expect(err.unrecoverable).toBe(true);
    }
  });

  it('throws on 401 auth error (does NOT return partial)', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        like_count: 45, comments_count: 7,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

    const collector = new InstagramMetricsCollector();
    await expect(collector.collect('media-123', { accessToken: 'bad-token' }))
      .rejects.toThrow();
  });

  it('throws with rateLimited flag on 429', async () => {
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

  it('throws on 500 server error (transient)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );
    const collector = new InstagramMetricsCollector();
    await expect(collector.collect('media-123', { accessToken: 'test' }))
      .rejects.toThrow();
  });
});
```

- [ ] **Step 2: Implement Instagram collector**

```typescript
// src/plugins/metrics-collectors/instagram.ts
// Two API calls:
// 1. GET /{media-id}?fields=like_count,comments_count → likes, comments
// 2. GET /{media-id}/insights?metric=impressions,reach,saved,shares → impressions, reach, saves, shares
// Merge both into MetricsData.
//
// Insights fallback rules:
// - HTTP 400 with "Insights are not available" → return partial (likes/comments only). This is expected for posts < 24h old.
// - HTTP 401/403 (auth/permission error) → throw (propagates as API error, retry next cycle)
// - HTTP 429 (rate limit) → throw with { rateLimited: true } (poller skips platform)
// - HTTP 404 → throw with { unrecoverable: true } (poller disables metrics for this post)
// - HTTP 5xx → throw (transient, retry next cycle)
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/plugins/metrics-collectors/instagram.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/plugins/metrics-collectors/instagram.ts tests/plugins/metrics-collectors/instagram.test.ts
# Commit: "feat(sp2): Instagram metrics collector (basic + insights)"
```

---

## Task 5: MetricsPoller — Core Polling Loop

**Files:**
- Create: `src/worker/metrics-poller.ts`
- Test: `tests/worker/metrics-poller.test.ts`

- [ ] **Step 1: Write core polling logic tests**

```typescript
// tests/worker/metrics-poller.test.ts
import { describe, it, expect } from 'vitest';
import { mergeMetrics, isDryRunPost, buildCredentials } from '../../src/worker/metrics-poller.js';

describe('mergeMetrics', () => {
  it('new values overwrite existing', () => {
    const result = mergeMetrics({ views: 100, likes: 5 }, { views: 200, likes: 10 });
    expect(result).toEqual({ views: 200, likes: 10 });
  });

  it('missing fields preserve existing values', () => {
    const result = mergeMetrics({ views: 100, likes: 5, shares: 3 }, { views: 200 });
    expect(result).toEqual({ views: 200, likes: 5, shares: 3 });
  });

  it('new fields added to existing', () => {
    const result = mergeMetrics({ views: 100 }, { likes: 5 });
    expect(result).toEqual({ views: 100, likes: 5 });
  });

  it('empty existing works', () => {
    const result = mergeMetrics({}, { views: 100 });
    expect(result).toEqual({ views: 100 });
  });
});

describe('isDryRunPost', () => {
  it('returns true for dry-run prefix', () => {
    expect(isDryRunPost('dry-run-abc123')).toBe(true);
  });
  it('returns false for real tweet ID', () => {
    expect(isDryRunPost('1234567890')).toBe(false);
  });
});

describe('buildCredentials', () => {
  it('returns bearerToken for twitter', () => {
    const creds = buildCredentials('twitter', {}, { TWITTER_BEARER_TOKEN: 'bt-123' } as any);
    expect(creds).toEqual({ bearerToken: 'bt-123' });
  });
  it('returns accessToken for instagram', () => {
    const creds = buildCredentials('instagram', { accessToken: 'ig-token' }, {} as any);
    expect(creds).toEqual({ accessToken: 'ig-token' });
  });
  it('returns null for twitter without bearer token', () => {
    const creds = buildCredentials('twitter', {}, {} as any);
    expect(creds).toBeNull();
  });
});

// Cycle-level behavior tests (with mocked DB/collectors):
describe('MetricsPoller cycle behavior', () => {
  // These require mocked DB queries and collector registry.
  // Implement with vi.fn() mocks for db.select/update/insert, registry.names/resolve.

  it('skips posts with dry-run platform_post_id', async () => {
    // Setup: post with platform_post_id = 'dry-run-abc123'
    // Assert: collector.collect() never called for this post
  });

  it('skips posts with metrics_disabled = true', async () => {
    // Setup: post with metricsDisabled = true
    // Assert: excluded from query results
  });

  it('skips posts when credentials are missing', async () => {
    // Setup: twitter post, no TWITTER_BEARER_TOKEN in config
    // Assert: collector not called, postsSkipped incremented
  });

  it('sets metrics_disabled on unrecoverable 404', async () => {
    // Setup: collector.collect() throws { unrecoverable: true }
    // Assert: db.update sets metricsDisabled = true
  });

  it('skips remaining platform posts on 429', async () => {
    // Setup: 3 twitter posts, first throws { rateLimited: true }
    // Assert: only 1 collect() call, remaining 2 skipped
  });

  it('respects hourly budget cap', async () => {
    // Setup: hourly budget = 2 calls, 3 eligible posts
    // Assert: only 2 collect() calls made
  });
});
```

- [ ] **Step 2: Implement MetricsPoller**

```typescript
// src/worker/metrics-poller.ts
// Key responsibilities:
// - Runs on 60s setInterval
// - Queries eligible posts (posted, real platform_post_id, not disabled, due based on decay)
// - Checks registry.names().includes(platform) before resolve()
// - Checks credentials exist before calling
// - Tracks rolling hourly call budget per platform
// - Processes newest posts first (posted_at DESC)
// - Merges: { ...existingPostMetrics, ...collectedMetrics }
// - Inserts merged snapshot into metrics_snapshots
// - Updates posts.metrics + posts.last_metrics_collected_at
// - On 404/unrecoverable: sets posts.metrics_disabled = true
// - On 429: skips platform for rest of cycle
// - Logs: { postsPolled, postsSkipped, errors }
```

Constructor takes: `db`, `metricsCollectorRegistry`, `config` (for `TWITTER_BEARER_TOKEN`), `logger`

**Credential flow:** The poller queries `accounts.credentials` for each post's account. It builds the credentials object per platform:
- Twitter: `{ bearerToken: config.TWITTER_BEARER_TOKEN }` (app-level, from env)
- Instagram: `{ accessToken: account.credentials.accessToken }` (per-account, from DB)
- If required credentials are missing → skip post silently, increment `postsSkipped`

Export helper functions (`mergeMetrics`, `isDryRunPost`, `buildCredentials`) for unit testing.

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/worker/metrics-poller.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/worker/metrics-poller.ts tests/worker/metrics-poller.test.ts
# Commit: "feat(sp2): MetricsPoller with decay scheduling, rate limiting, merge semantics"
```

---

## Task 6: Wire MetricsPoller into Worker

**Files:**
- Modify: `src/worker/index.ts`

- [ ] **Step 1: Import and start MetricsPoller**

```typescript
import { MetricsPoller } from './metrics-poller.js';
import { createRegistry } from '../plugins/registry.js';
import type { MetricsCollector } from '../plugins/metrics-collectors/types.js';
import { TwitterMetricsCollector } from '../plugins/metrics-collectors/twitter.js';
import { InstagramMetricsCollector } from '../plugins/metrics-collectors/instagram.js';

// Metrics collector registry — always register both, let poller handle missing credentials
const metricsCollectorRegistry = createRegistry<MetricsCollector>();
metricsCollectorRegistry.register('twitter', () => new TwitterMetricsCollector());
metricsCollectorRegistry.register('instagram', () => new InstagramMetricsCollector());

// Metrics poller
const metricsPoller = new MetricsPoller({
  db, metricsCollectorRegistry, config, logger,
});
metricsPoller.start();

// Graceful shutdown — add to existing handlers
metricsPoller.stop();
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/worker/index.ts
# Commit: "feat(sp2): wire MetricsPoller into worker with Twitter + Instagram collectors"
```

---

## Task 7: Web API — Metrics History + Filters

**Files:**
- Create: `src/web/api/metrics.ts`
- Modify: `src/web/api/posts.ts`
- Modify: `src/web/index.ts` (register metrics routes)

- [ ] **Step 1: Create metrics-history endpoint**

```typescript
// src/web/api/metrics.ts
// GET /api/posts/:id/metrics-history
// Returns: { postId, snapshots: [{ collectedAt, metrics }] }
// Query: SELECT * FROM metrics_snapshots WHERE post_id = :id ORDER BY collected_at ASC
```

- [ ] **Step 2: Add filters to GET /api/posts**

Add query params: `platform`, `vertical`, `since`, `until`, `summary`

```typescript
// In posts.ts GET /api/posts handler:
// - platform: join accounts, filter by accounts.platform
// - vertical: join verticals via content_items, filter by verticals.slug
// - since/until: filter by posts.posted_at
// - summary=true: wrap response in { items: [...], summary: { totalPosts, totalViews, ... } }
//   Summary aggregates from posts.metrics JSONB
// - Default (no summary): return bare array (backwards compatible)
//
// PAGINATION DECISION: Keep the existing limit(50) for the `items` array.
// When `summary=true`, the summary row is computed from a SEPARATE COUNT/SUM query
// over the FULL filtered dataset (not just the 50-item page). This means:
//   - `items` = first 50 posts (paginated, newest first)
//   - `summary` = totals across ALL matching posts (not limited to 50)
// This avoids loading thousands of rows while still giving accurate totals.
// Full pagination (offset/cursor) is a future enhancement — not in this SP.
```

- [ ] **Step 3: Register metrics routes**

```typescript
// In src/web/index.ts
import { registerMetricsRoutes } from './api/metrics.js';
registerMetricsRoutes(app, db);
```

- [ ] **Step 4: Write API route tests**

```typescript
// tests/web/api/metrics-routes.test.ts
// Using Fastify inject or supertest:

describe('GET /api/posts (filters + summary)', () => {
  it('returns bare array by default (backwards compatible)', async () => {
    // Assert: response is an array, not an object
  });

  it('returns { items, summary } when summary=true', async () => {
    // Assert: response has items (array) + summary (object with totalPosts, etc.)
  });

  it('filters by platform param', async () => {
    // Assert: only posts from matching platform returned
  });

  it('summary aggregates over full filtered set, not just page', async () => {
    // Setup: >50 matching posts
    // Assert: items.length <= 50, summary.totalPosts > 50
  });
});

describe('GET /api/posts/:id/metrics-history', () => {
  it('returns snapshots sorted by collectedAt ascending', async () => {
    // Assert: response.snapshots[0].collectedAt < response.snapshots[1].collectedAt
  });

  it('returns empty snapshots for post with no metrics', async () => {
    // Assert: response.snapshots = []
  });
});
```

- [ ] **Step 5: Verify API manually**

```bash
npm run dev:web
curl -s 'http://localhost:3001/api/posts?platform=twitter&summary=true' | head -c 300
```

- [ ] **Step 6: Commit**

```bash
git add src/web/
# Commit: "feat(sp2): metrics-history endpoint + posts API filters (platform, vertical, date, summary)"
```

---

## Task 8: Dashboard — Inline Metrics + Filters

**Files:**
- Modify: `src/web/dashboard/src/pages/PostMonitor.tsx`
- Modify: `src/web/dashboard/src/api.ts`

- [ ] **Step 1: Install recharts**

```bash
npm install recharts
```

- [ ] **Step 2: Update dashboard API client**

```typescript
// Add to src/web/dashboard/src/api.ts

export async function fetchPostsWithFilters(params: {
  status?: string;
  platform?: string;
  vertical?: string;
  since?: string;
  until?: string;
  summary?: boolean;
}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.platform) qs.set('platform', params.platform);
  if (params.vertical) qs.set('vertical', params.vertical);
  if (params.since) qs.set('since', params.since);
  if (params.until) qs.set('until', params.until);
  if (params.summary) qs.set('summary', 'true');
  const res = await fetch(`/api/posts?${qs}`);
  return res.json();
}

export async function fetchMetricsHistory(postId: string) {
  const res = await fetch(`/api/posts/${postId}/metrics-history`);
  return res.json();
}
```

- [ ] **Step 3: Add inline metrics to PostMonitor**

Update each post card to show metrics when available:

```tsx
// Inside post card, after status display:
{post.metrics && (
  <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '8px' }}>
    {post.metrics.views != null && <span>Views: {post.metrics.views.toLocaleString()} </span>}
    {post.metrics.likes != null && <span>· Likes: {post.metrics.likes} </span>}
    {post.metrics.shares != null && <span>· Shares: {post.metrics.shares} </span>}
    {post.metrics.comments != null && <span>· Comments: {post.metrics.comments} </span>}
  </div>
)}
```

- [ ] **Step 4: Add filter dropdowns**

Add Platform, Vertical, Date Range dropdowns above the posts list. Wire to `fetchPostsWithFilters`. Add aggregate summary row when summary data is available.

- [ ] **Step 5: Verify in browser**

Open http://localhost:5173/posts (or 5174 if port 5173 is taken) — check filters work and metrics display inline.

- [ ] **Step 6: Commit**

```bash
git add src/web/dashboard/ package.json package-lock.json
# Commit: "feat(sp2): dashboard — inline metrics, platform/vertical/date filters, summary row"
```

---

## Task 9: Dashboard — Engagement Curve Chart

**Files:**
- Create: `src/web/dashboard/src/components/MetricsChart.tsx`
- Modify: `src/web/dashboard/src/pages/PostMonitor.tsx`

- [ ] **Step 1: Create MetricsChart component**

```tsx
// src/web/dashboard/src/components/MetricsChart.tsx
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchMetricsHistory } from '../api.js';

interface ChartPoint {
  label: string;
  views: number | null;
  likes: number | null;
}

export function MetricsChart({ postId, postedAt }: { postId: string; postedAt: string }) {
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetricsHistory(postId).then(result => {
      const postTime = new Date(postedAt).getTime();
      const chartData: ChartPoint[] = result.snapshots.map((s: any) => {
        const elapsedMs = new Date(s.collectedAt).getTime() - postTime;
        const mins = Math.round(elapsedMs / 60_000);
        const label = mins < 60 ? `+${mins}m` : `+${(mins / 60).toFixed(1)}h`;
        return {
          label,
          views: s.metrics.views ?? null,   // null = unknown, not zero
          likes: s.metrics.likes ?? null,
        };
      });
      setData(chartData);
      setLoading(false);
    });
  }, [postId, postedAt]);

  if (loading) return <div style={{ padding: '20px', color: '#64748b' }}>Loading chart...</div>;
  if (data.length === 0) return <div style={{ padding: '20px', color: '#64748b' }}>No metrics data yet</div>;

  return (
    <div style={{ width: '100%', height: 250, marginTop: '12px' }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
          <YAxis stroke="#64748b" fontSize={12} />
          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
          <Line type="monotone" dataKey="views" stroke="#3b82f6" strokeWidth={2} dot={false} name="Views" />
          <Line type="monotone" dataKey="likes" stroke="#22c55e" strokeWidth={2} dot={false} name="Likes" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Add "View Chart" toggle to PostMonitor**

Each post card gets a "View Chart" button that expands/collapses the `MetricsChart` component.

- [ ] **Step 3: Verify in browser**

Post Monitor → click "View Chart" on a posted item → should show line chart (or "No metrics data yet" if no snapshots exist).

- [ ] **Step 4: Commit**

```bash
git add src/web/dashboard/
# Commit: "feat(sp2): engagement curve chart with recharts"
```

---

## Task 10: Full Verification

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: 107 existing + ~25 new = ~132 tests passing.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Start all 3 processes**

```bash
# Terminal 1
npm run dev:web
# Terminal 2
npm run dev:worker
# Terminal 3
npm run dev:dashboard
```

- [ ] **Step 4: Verify metrics collection**

If you have real Twitter/Instagram credentials configured:
1. Approve a content item → post goes to real platform
2. Watch worker logs for: `Metrics collected { postId: ..., platform: 'twitter', views: ... }`
3. Check DB: `SELECT * FROM metrics_snapshots ORDER BY collected_at DESC LIMIT 5;`
4. Check dashboard: Post Monitor should show inline metrics within 5 minutes

If using dry-run only:
1. Dry-run posts are excluded from metrics collection (verify no polling attempts in logs)
2. Metrics endpoints return empty data (correct behavior)

- [ ] **Step 5: Verify dashboard filters**

1. Open http://localhost:5173/posts (or 5174 if port 5173 is taken)
2. Select Platform filter → verify posts filter
3. Select Vertical filter → verify posts filter
4. Select Date range → verify posts filter
5. Check summary row updates with filters

- [ ] **Step 6: Verify engagement chart**

1. Click "View Chart" on a post with metrics data
2. Should show line chart with Views + Likes over time

- [ ] **Step 7: Commit**

```bash
git add -A
# Commit: "feat(sp2): Metrics Collector — complete implementation"
```
