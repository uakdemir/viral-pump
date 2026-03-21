# ViralEngine — Sub-project #2: Metrics Collector

**Date:** 2026-03-21
**Status:** Draft
**Scope:** Collect engagement metrics from platform APIs, store time-series snapshots, display in dashboard with filters and engagement curve charts.

---

## 1. Overview

Build a metrics collection pipeline that polls platform APIs for post engagement data (views, likes, shares, comments, etc.), stores both the latest values and time-series snapshots, and displays them in the dashboard with filtering and engagement curve visualization.

Metrics are collected per post using a per-platform decay schedule — frequent polling right after posting, slowing down as posts age, stopping after a platform-specific maximum age.

### What this sub-project delivers

- `MetricsCollector` plugin interface with factory/registry pattern
- Twitter and Instagram metrics collector implementations
- Per-platform configurable decay schedule for polling frequency
- `metrics_snapshots` table for time-series engagement data
- Metrics polling loop in the worker process
- Dashboard: inline metrics on Post Monitor + engagement curve chart per post
- Dashboard filters: platform, vertical, date range
- Aggregate summary row (total posts, views, likes, shares for filtered set)
- `updated_at` column added to all tables that are missing it (schema consistency cleanup)

### What this sub-project does NOT deliver

- Metrics collectors for platforms without credentials (LinkedIn, Pinterest, Telegram, etc. — interface only)
- Metrics rollup/aggregation for long-term storage optimization
- Learning engine analysis of metrics (SP#5)
- Cost-per-engagement calculations
- Category/tag/free-text search filters (deferred)

---

## 2. Dependencies

- **Requires:** Sub-project #1 (Core Pipeline MVP) — already complete. Sub-project #4 (Multi-Platform Posting) — already complete, provides `posts.platform_post_id`, multi-platform accounts, and `posts.metrics` JSONB column.
- **Credentials needed:**
  - Twitter: `TWITTER_BEARER_TOKEN` in `.env` (add to `config.ts`). The bearer token is generated automatically when you create a Twitter app — it was shown alongside the API Key/Secret in the developer portal. It's app-level (not per-account) and can read public metrics for any tweet.
  - Instagram: per-account access token from `accounts.credentials.accessToken` (already configured)

---

## 3. MetricsCollector Plugin Interface

```typescript
interface MetricsData {
  views?: number;
  likes?: number;
  shares?: number;       // retweets (Twitter), shares (other)
  comments?: number;
  saves?: number;        // bookmarks (Twitter), saves (Instagram)
  clicks?: number;
  reach?: number;         // Instagram-specific
  impressions?: number;   // Instagram-specific
  extra?: Record<string, unknown>;  // platform-specific fields
}

interface MetricsCollector {
  collect(platformPostId: string, credentials: Record<string, unknown>): Promise<MetricsData>;
}
```

### Implementations

| Platform | Implementation | Status |
|---|---|---|
| Twitter/X | `TwitterMetricsCollector` | Partial — bearer token + `public_metrics` gives likes, shares, comments, saves. **Views (impression_count) requires OAuth user context** — not available via bearer token. Backlog: switch to per-account OAuth for full metrics. |
| Instagram | `InstagramMetricsCollector` | Full — uses `GET /{media-id}/insights` + `GET /{media-id}?fields=like_count,comments_count` |
| Others | Not registered | Silently skipped by poller (checked via `registry.names()` before `resolve()`) |

### Resolution

Resolved from `accounts.platform` via registry:

```typescript
metricsCollectorRegistry.register('twitter', (cfg) => new TwitterMetricsCollector(cfg));
metricsCollectorRegistry.register('instagram', (cfg) => new InstagramMetricsCollector(cfg));
// Other platforms are not registered — poller checks names() before resolve() and skips silently
```

Posts on platforms without a registered collector are silently skipped. The poller checks `metricsCollectorRegistry.names().includes(platform)` before calling `resolve()` — this avoids the "Unknown plugin" exception from the shared registry. Posts on unregistered platforms increment `postsSkipped` in the cycle log.

---

## 4. Per-Platform Decay Schedule

Metrics collection frequency decays as posts age — frequent right after posting, slowing down over time.

### Schedule config

```typescript
interface DecayPhase {
  durationMs: number;    // how long this phase lasts
  intervalMs: number;    // poll frequency during this phase
}

interface MetricsSchedule {
  phases: DecayPhase[];
  maxAgeMs: number;      // stop polling entirely after this age
}
```

### Default schedules

**Twitter/X:**

| Phase | Duration | Poll interval | Rationale |
|---|---|---|---|
| Aggressive | First 2 hours | Every 5 min | Tweet virality peaks in first 1-2 hours |
| Medium | Next 22 hours | Every 30 min | Still accumulating engagement |
| Slow | Next 6 days | Every 6 hours | Tailing off |
| Stop | After 7 days | — | Twitter content is effectively dead after a week |

**Instagram:**

| Phase | Duration | Poll interval | Rationale |
|---|---|---|---|
| Aggressive | First 6 hours | Every 15 min | Algorithm pushes early engagement |
| Medium | Next 42 hours | Every 1 hour | Explore page can drive delayed engagement |
| Slow | Next 12 days | Every 6 hours | Long-tail from Explore/hashtags |
| Stop | After 30 days | — | Instagram content has moderate long-tail |

### Future platform defaults (not implemented, for reference)

| Platform | Max age | Rationale |
|---|---|---|
| Pinterest | 6 months | Search-driven, very long tail |
| TikTok | 90 days | FYP resurfaces content weeks later |
| LinkedIn | 14 days | Similar to Twitter but slightly longer |
| Telegram | 1 day | No algorithm, no discovery |
| Newsletter | 2 days | Open rate stabilizes within 48 hours |
| Blog | 1 year | SEO traffic builds over months |

Schedules are stored as code constants (not DB) — they represent platform characteristics, not user preferences.

---

## 5. Schema Changes

### New table: `metrics_snapshots`

```sql
CREATE TABLE metrics_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id         UUID NOT NULL REFERENCES posts(id),
    collected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    metrics         JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_metrics_snapshots_post ON metrics_snapshots(post_id, collected_at);
```

Append-only table — one row per metrics poll. Never updated, never deleted (future rollup optimization in backlog).

### Modified table: `posts`

- Add `last_metrics_collected_at` TIMESTAMPTZ (nullable) — when metrics were last polled
- Add `metrics_disabled` BOOLEAN (default false) — set to true for posts with permanently invalid platform IDs (deleted posts, 404 errors)

### Schema consistency: add `updated_at` to all tables missing it

| Table | Has `updated_at`? | Action |
|---|---|---|
| `verticals` | Yes | No change |
| `content_templates` | Yes | No change |
| `accounts` | No | Add |
| `data_sources` | No | Add |
| `trigger_rules` | No | Add |
| `content_items` | No | Add |
| `posts` | No | Add |
| `job_queue` | No | Add |
| `metrics_snapshots` | New | Included |

All `updated_at` columns: `TIMESTAMPTZ NOT NULL DEFAULT now()`.

---

## 6. Metrics Polling Loop

### Worker integration

A new `MetricsPoller` class runs alongside the existing scheduler and job processing loop in the worker process. It runs on a **60-second interval** (independent of the job queue — this is direct polling, not a job).

### Concurrency model

**Single-worker assumption for MVP.** The metrics poller does NOT use `FOR UPDATE SKIP LOCKED` or claim/lease semantics. It queries due posts and makes API calls directly. If multiple workers are running, they will duplicate API calls and snapshot inserts.

**This is acceptable because:**
- MVP runs a single worker process
- Duplicate snapshots are harmless (append-only, same data)
- Duplicate API calls waste rate limit budget but don't corrupt data

**When scaling to multiple workers:** Add a `metrics_claimed_at` / `metrics_claimed_by` column to `posts` (same lease pattern as `job_queue`) and claim posts before collecting. This is a backlog item, not MVP scope.

### Per-poll cycle

```
1. Query all posts WHERE status = 'posted'
   AND platform_post_id IS NOT NULL
   AND platform_post_id NOT LIKE 'dry-run-%'  -- exclude dry-run/synthetic posts
   AND metrics_disabled = false               -- exclude permanently failed posts
   AND (last_metrics_collected_at IS NULL OR needs polling based on decay schedule)

   NOTE: Dry-run posts have fake platform_post_id prefixed with 'dry-run-'. These are never eligible for metrics collection — they have no real platform counterpart to query. The prefix check is the simplest filter. Alternatively, join accounts and check `accounts.config.dryRun != true`, but the prefix check avoids the join.

2. For each post:
   a. Compute post age: now() - posted_at
   b. Look up platform's MetricsSchedule
   c. If age > maxAgeMs → skip (post is too old)
   d. Determine current decay phase → get intervalMs
   e. If now() - last_metrics_collected_at < intervalMs → skip (not due yet)
   f. Resolve MetricsCollector from registry by accounts.platform
   g. If no collector registered → skip silently
   h. Call collector.collect(platformPostId, credentials)
   i. Merge: `mergedMetrics = { ...existingPostMetrics, ...collectedMetrics }` (new values overwrite, missing values preserved)
   j. INSERT into metrics_snapshots with `mergedMetrics` (full merged state, not partial)
   k. UPDATE posts SET metrics = mergedMetrics, last_metrics_collected_at = now()

3. Log: { postsPolled, postsSkipped, errors }
```

### Error handling

- API errors (rate limit, network) → log warning, skip this post this cycle, retry next cycle
- Unrecoverable ID errors (404 "post not found", deleted posts) → set `posts.metrics_disabled = true` on that row. The polling query excludes `metrics_disabled = true` posts. This prevents retrying a bad ID for days until maxAge expires. Add `metrics_disabled BOOLEAN DEFAULT false` to posts schema.
- Collector not registered → skip silently (expected for platforms without implementations)
- Missing credentials (e.g., `TWITTER_BEARER_TOKEN` absent, or `accounts.credentials.accessToken` empty) → log at debug level, increment `postsSkipped`, do NOT call the collector, do NOT mark the post as failed or disabled. The post remains eligible for future collection once credentials are configured.

### Rate limit handling

**Per-platform hourly budget** controls total API calls, not a per-cycle cap:

| Platform | API budget | Calls per post | Max posts per hour | Max posts per 60s cycle |
|---|---|---|---|---|
| Twitter | 300 req/15 min (1200/hour) | 1 | 1200 | 20 |
| Instagram | 200 req/hour | 2 (media + insights) | 100 | ~1-2 |

The poller maintains a **rolling counter per platform** (calls made in the last hour). Before collecting a post, it checks: `callsMadeThisHour + callsNeeded <= hourlyBudget`. If budget is exhausted, remaining posts carry over to the next cycle.

Posts are processed in `posted_at DESC` order (newest first — they're in the most valuable aggressive phase).

If a platform API returns HTTP 429, log a warning and skip that platform's remaining posts for the current cycle.

---

## 7. Twitter Metrics Implementation

### API endpoint

```
GET https://api.x.com/2/tweets/:id?tweet.fields=public_metrics,non_public_metrics,organic_metrics
Authorization: Bearer {bearer_token}
```

### Response mapping

```typescript
// Twitter public_metrics → MetricsData
{
  views: public_metrics.impression_count,
  likes: public_metrics.like_count,
  shares: public_metrics.retweet_count + public_metrics.quote_count,
  comments: public_metrics.reply_count,
  saves: public_metrics.bookmark_count,
  extra: {
    retweets: public_metrics.retweet_count,
    quotes: public_metrics.quote_count,
    bookmarks: public_metrics.bookmark_count,
  }
}
```

### Auth

Uses `TWITTER_BEARER_TOKEN` from `.env` (app-level, not per-account). Add to `config.ts` schema: `TWITTER_BEARER_TOKEN: z.string().optional()`. The bearer token can read public metrics for any tweet without per-account OAuth.

---

## 8. Instagram Metrics Implementation

### API endpoints

Instagram requires two calls per post:

**1. Basic metrics (real-time):**
```
GET https://graph.instagram.com/v21.0/{media-id}?fields=like_count,comments_count,timestamp
Authorization: Bearer {access_token}
```

**2. Insights (delayed ~24h for some):**
```
GET https://graph.instagram.com/v21.0/{media-id}/insights?metric=impressions,reach,saved,shares
Authorization: Bearer {access_token}
```

### Response mapping

```typescript
{
  likes: like_count,
  comments: comments_count,
  impressions: insights.impressions,
  reach: insights.reach,
  saves: insights.saved,
  shares: insights.shares,
  extra: {
    timestamp: media.timestamp,
  }
}
```

### Auth

Uses the per-account access token from `accounts.credentials.accessToken`. This is the long-lived (60-day) token generated from the dashboard.

---

## 9. Web API

### New endpoint

**`GET /api/posts/:id/metrics-history`**

Returns all snapshots for a post, sorted by `collected_at`:

```json
{
  "postId": "...",
  "snapshots": [
    { "collectedAt": "2026-03-21T10:00:00Z", "metrics": { "views": 120, "likes": 3 } },
    { "collectedAt": "2026-03-21T10:05:00Z", "metrics": { "views": 350, "likes": 8 } },
    { "collectedAt": "2026-03-21T10:30:00Z", "metrics": { "views": 1240, "likes": 23 } }
  ]
}
```

### Modified endpoint

**`GET /api/posts`** — already returns `posts.metrics`. Add query params:

- `platform` — filter by `accounts.platform` (e.g., `?platform=twitter`)
- `vertical` — filter by `verticals.slug` (e.g., `?vertical=gold-forex`)
- `since` / `until` — date range filter on `posts.posted_at` (ISO 8601 format)
- `summary=true` — include aggregate totals alongside the items array

All filters are combinable with each other and with the existing `status` filter.

**Response format when `summary=true`:**

```json
{
  "items": [
    { "id": "...", "status": "posted", "metrics": { "views": 1240, "likes": 23 }, ... }
  ],
  "summary": {
    "totalPosts": 42,
    "totalViews": 28500,
    "totalLikes": 340,
    "totalShares": 89,
    "totalComments": 67
  }
}
```

**Response format when `summary` is omitted (default — backwards compatible):**

Returns a bare array as before:

```json
[
  { "id": "...", "status": "posted", "metrics": { "views": 1240, "likes": 23 }, ... }
]
```

This ensures the existing dashboard client continues working without changes until it opts into the summary format.

---

## 10. Dashboard

### Post Monitor enhancements

Each post row shows inline metrics (from `posts.metrics`):

```
┌─────────────────────────────────────────────────────────┐
│  Gold Price Alert — Gold Forex EN (Twitter)              │
│  Status: ● Posted — 2h ago                               │
│  👁 1,240 views  ❤ 23 likes  🔄 8 shares  💬 3 comments  │
│  [View Chart ▾]                                          │
└─────────────────────────────────────────────────────────┘
```

### Filters (top of Post Monitor)

```
[All Platforms ▼]  [All Verticals ▼]  [Last 7 days ▼]
Summary: 42 posts · 28.5K views · 340 likes · 89 shares
```

- Platform: dropdown with Twitter, Instagram, All
- Vertical: dropdown with Gold/Forex, Fitness, Dating, All
- Date range: Last 24h, Last 7 days, Last 30 days, Custom

### Engagement curve chart

Click "View Chart" on a post → expands to show a line chart:

- X-axis: time since posting
- Y-axis: cumulative views (primary), likes (secondary)
- Data from `GET /api/posts/:id/metrics-history`
- Library: `recharts` (React, lightweight ~45KB)

---

## 11. File Changes

### New files

| File | Purpose |
|---|---|
| `src/plugins/metrics-collectors/types.ts` | `MetricsCollector` interface, `MetricsData` type |
| `src/plugins/metrics-collectors/twitter.ts` | Twitter metrics via X API v2 |
| `src/plugins/metrics-collectors/instagram.ts` | Instagram metrics via Graph API |
| `src/shared/metrics-schedules.ts` | Per-platform decay schedule constants |
| `src/shared/schema/metrics-snapshots.ts` | Drizzle schema for `metrics_snapshots` table |
| `src/worker/metrics-poller.ts` | Polling loop: decay schedule, collect, store |
| `src/web/api/metrics.ts` | `GET /api/posts/:id/metrics-history` endpoint |
| `src/web/dashboard/src/components/MetricsChart.tsx` | Recharts engagement curve component |
| `tests/shared/metrics-schedules.test.ts` | Decay phase resolution tests |
| `tests/plugins/metrics-collectors/twitter.test.ts` | Twitter collector tests (mocked API) |
| `tests/plugins/metrics-collectors/instagram.test.ts` | Instagram collector tests (mocked API) |

### Modified files

| File | Change |
|---|---|
| `src/shared/config.ts` | Add `TWITTER_BEARER_TOKEN` to env schema |
| `src/shared/schema/posts.ts` | Add `lastMetricsCollectedAt`, `metricsDisabled`, `updatedAt` columns |
| `src/shared/schema/accounts.ts` | Add `updatedAt` column |
| `src/shared/schema/data-sources.ts` | Add `updatedAt` column |
| `src/shared/schema/trigger-rules.ts` | Add `updatedAt` column |
| `src/shared/schema/content-items.ts` | Add `updatedAt` column |
| `src/shared/schema/job-queue.ts` | Add `updatedAt` column |
| `src/shared/schema/index.ts` | Export `metricsSnapshots` |
| `src/web/api/posts.ts` | Add platform/vertical/date filters + summary param |
| `src/web/api/router.ts` | Register metrics routes |
| `src/web/dashboard/src/pages/PostMonitor.tsx` | Inline metrics, filters, chart expand |
| `src/web/dashboard/src/api.ts` | Add `fetchMetricsHistory`, filter params |
| `src/worker/index.ts` | Start `MetricsPoller` alongside existing loops |

---

## 12. Success Criteria

### Metrics Collection
- [ ] `MetricsCollector` interface exists with factory/registry
- [ ] Twitter collector fetches views, likes, retweets, replies, bookmarks from X API v2
- [ ] Instagram collector fetches likes, comments, impressions, reach, saves from Graph API
- [ ] Posts on platforms without a collector are silently skipped

### Decay Schedule
- [ ] Per-platform decay schedules configured (Twitter: 7-day, Instagram: 30-day)
- [ ] Polling frequency decreases as posts age (aggressive → medium → slow → stop)
- [ ] Posts older than `maxAgeMs` are not polled

### Data Storage
- [ ] `metrics_snapshots` table stores one row per poll with full metrics JSONB
- [ ] `posts.metrics` updated with latest values on each poll
- [ ] `posts.last_metrics_collected_at` tracks when each post was last polled
- [ ] Time-series data preserved for engagement curve analysis

### Schema Consistency
- [ ] `updated_at` column added to all tables that were missing it (accounts, data_sources, trigger_rules, content_items, posts, job_queue)

### Web API
- [ ] `GET /api/posts/:id/metrics-history` returns time-series snapshots
- [ ] `GET /api/posts` supports `platform`, `vertical`, `since`, `until` filter params
- [ ] `GET /api/posts?summary=true` returns aggregate totals

### Dashboard
- [ ] Post Monitor shows inline metrics per post (views, likes, shares, comments)
- [ ] Platform filter dropdown works
- [ ] Vertical filter dropdown works
- [ ] Date range filter works
- [ ] Aggregate summary row updates with filters
- [ ] "View Chart" expands to show engagement curve (recharts line chart)
- [ ] Chart shows views + likes over time from snapshots data

### Filtering & Error Handling
- [ ] Dry-run posts (`platform_post_id` starting with `dry-run-`) are never polled
- [ ] Posts with `metrics_disabled = true` are never polled
- [ ] Unrecoverable 404 errors set `metrics_disabled = true`
- [ ] API rate limit errors (429) logged and platform skipped for rest of cycle
- [ ] Network errors don't crash the poller
- [ ] Missing credentials skip collection silently (post stays eligible for later)
- [ ] Rolling hourly budget prevents exceeding platform API limits

### Regression
- [ ] All existing tests pass (107+)
- [ ] Gold/Forex event-driven pipeline still works
- [ ] Fitness/Dating scheduled triggers still fire
- [ ] Multi-platform posting + dry-run still works
