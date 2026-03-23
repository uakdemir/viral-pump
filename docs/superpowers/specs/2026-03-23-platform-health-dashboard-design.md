# Platform Health Dashboard — Design Spec

**Date:** 2026-03-23
**Scope:** Operational overview dashboard — job queue depth, failure rate, data source polling, account status
**Goal:** A single glance tells the operator whether the system is healthy. Traffic-light indicators in the nav bar + a dedicated detail page with 2x2 card grid.

---

## 1. Approach

**Pure DB queries.** Each health signal is computed by querying existing tables (`job_queue`, `posts`, `data_sources`, `accounts`) on demand. A single API endpoint runs 4 queries and returns aggregated status. No new tables, no schema changes. One minimal worker-side fix: add `updated_at = now()` to `PostgresJobQueue.fail()`'s raw SQL so the "failed in last hour" query returns accurate results (see Section 3).

**Note:** The existing liveness endpoint at `GET /health` (returns `{ status: 'ok', timestamp }`) will be moved to `GET /api/ping` to free the `/health` route for the dashboard SPA page.

If query cost becomes an issue at scale, reduce poll frequency or graduate to a materialized health table — but that's deferred.

---

## 2. Health Signals & Thresholds

Four signals, each with green/yellow/red status. Overall status = worst of the four.

| Signal                  | Green                                                             | Yellow                                   | Red                                               |
| ----------------------- | ----------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| **Job Queue**           | <10 pending                                                       | 10–50 pending OR >=1 failed in last hour | >=51 pending OR >=6 failed in last hour           |
| **Failure Rate**        | <5% of attempted posts failed (24h)                               | 5–<15% failed (24h)                      | >=15% failed (24h)                                |
| **Data Source Polling** | All sources polled within 2× their `poll_interval_ms`             | Any source >2× overdue                   | Any source >5× overdue OR never polled            |
| **Account Status**      | All active accounts' most recent post succeeded (or no posts yet) | Any account's most recent post failed    | >=50% of active accounts' most recent post failed |

Thresholds are hardcoded in `HEALTH_THRESHOLDS` constant for v1. All threshold comparisons use `>=` (e.g., yellow when `failedLastHour >= FAILED_HOUR_YELLOW`). Evaluation order: check red first, then yellow, default green.

**Failure rate denominator:** Only attempted posts count — `total24h` = posts where `status IN ('posted', 'failed')` created in the last 24h. Posts in `ready` or `skipped` status are excluded. If `total24h = 0`, rate = 0 (green).

---

## 3. API Endpoint

**`GET /api/health/status`**

Returns all 4 signals with status, metrics, and per-item detail where applicable.

### Response Shape

```typescript
interface HealthStatusResponse {
  jobQueue: {
    status: 'green' | 'yellow' | 'red';
    pending: number;
    processing: number;
    failedLastHour: number;
  };
  failureRate: {
    status: 'green' | 'yellow' | 'red';
    total24h: number;
    failed24h: number;
    rate: number; // 0.0–1.0
  };
  dataSources: {
    status: 'green' | 'yellow' | 'red';
    sources: Array<{
      id: string;
      provider: string;
      status: 'green' | 'yellow' | 'red';
      lastPolledAt: string | null;
      pollIntervalMs: number;
    }>;
  };
  accounts: {
    status: 'green' | 'yellow' | 'red';
    accounts: Array<{
      id: string;
      name: string;
      platform: string;
      status: 'green' | 'yellow' | 'red';
      lastPostStatus: string | null; // 'posted' | 'failed' | null (no posts)
      lastPostAt: string | null;
    }>;
  };
  overall: 'green' | 'yellow' | 'red';
}
```

### Queries

**Job Queue:**

```sql
SELECT status, COUNT(*) FROM job_queue
WHERE status IN ('pending', 'processing')
GROUP BY status;

SELECT COUNT(*) FROM job_queue
WHERE status = 'failed'
AND updated_at > now() - interval '1 hour';
```

Note: Uses `updated_at` (not `completed_at`) because `complete()` only sets `completed_at` for successful jobs. Currently, `fail()` does not set `updated_at` either — it uses raw SQL that skips this column. **Prerequisite fix:** Add `updated_at = now()` to the SET clause in `PostgresJobQueue.fail()` (`src/plugins/job-queue/postgres-queue.ts`, lines 75-86). This is a one-line data-integrity fix that makes the "failed in last hour" query accurate. Job queue status strings (`'pending'`, `'processing'`, `'failed'`) are used as inline literals — no `JOB_STATUS` constant exists in the codebase and adding one is out of scope.

**Failure Rate:**

```sql
SELECT status, COUNT(*) FROM posts
WHERE status IN ('posted', 'failed')
AND created_at > now() - interval '24 hours'
GROUP BY status;
```

Only attempted posts (`posted` + `failed`) are counted. Posts in `ready` or `skipped` status are excluded from both numerator and denominator. Uses `created_at` (not `posted_at`) because `posted_at` is NULL for failed posts.

**Data Sources:**

```sql
SELECT id, provider, poll_interval_ms, last_polled_at
FROM data_sources
WHERE status = 'active';
```

Threshold computation happens in application code: compare `Date.now() - last_polled_at` against `poll_interval_ms * 2` (yellow) and `poll_interval_ms * 5` (red). Sources with `last_polled_at IS NULL` are red.

**Time-window queries:** Compute cutoff timestamps in application code rather than using SQL `now() - interval` (pg-mem does not reliably support interval arithmetic). For Job Queue: `new Date(Date.now() - 3600000)` (1h). For Failure Rate: `new Date(Date.now() - 86400000)` (24h). Pass as parameters to Drizzle's `sql` template.

**Accounts:**

Use two separate Drizzle queries (no raw SQL, no lateral join — ensures pg-mem compatibility in tests):

1. Fetch all active accounts:

```sql
SELECT id, name, platform FROM accounts WHERE status = 'active';
```

2. For each account, fetch the most recent attempted post:

```sql
SELECT status, created_at FROM posts
WHERE account_id = :accountId AND status IN ('posted', 'failed')
ORDER BY created_at DESC LIMIT 1;
```

Application code maps each account to its last post status. Accounts with no attempted posts are treated as green (`lastPostStatus: null`). Expected account count for v1 is low single digits; if this grows beyond ~20, consolidate into a single query with a window function or subquery.

All queries use Drizzle's query builder with `sql` template helpers for aggregation (`count(*)`, `groupBy`) and time-window filters — no hand-written SQL strings via `db.execute()`.

### File

`src/web/api/health.ts` — exports `registerHealthRoutes(app: FastifyInstance, db: DB)` (matching `registerMetricsRoutes` pattern — no `jobQueue` param needed, read-only queries). Registered in `src/web/index.ts`.

---

## 4. Dashboard — Header Status Strip

**Location:** Top-right of the existing nav bar, on every page.

**Layout:** 4 colored dots with short labels: `● Queue  ● Failures  ● Polling  ● Accounts`

**Behavior:**

- Each dot colored green/yellow/red based on its signal status
- Tooltip on hover shows summary (e.g., "3 pending, 0 failed last hour")
- Click any dot → navigates to `/health` with that section's card scrolled into view (anchor hash)
- On mobile (<= 640px), show dots only (hide labels). Strip remains visible in the nav bar, does not move into the mobile menu.

**Shared polling:** Both `HealthStatusStrip` and `HealthDashboard` consume health data from a shared `useHealthStatus()` custom hook backed by React context. In `App.tsx`, wrap the `<Layout>` element with `<HealthStatusProvider>` so both Layout's `HealthStatusStrip` and route-level `HealthDashboard` share context. The hook fetches immediately on mount, then every 30 seconds via `setInterval` + `useState`. No new dependencies — built-in React state + context only.

**Hook return type:** `{ data: HealthStatusResponse | null; error: boolean; lastUpdated: Date | null }`. On success, `data` contains the response and `error` is false. On fetch failure (non-200 or network error), `data` is null, `error` is true, and the UI shows "Health check unavailable." The `HealthStatusResponse` type stays clean (no `'unknown'` variant) — error state is handled at the hook level.

**Files:**

- `src/web/dashboard/src/components/HealthStatusStrip.tsx`
- `src/web/dashboard/src/hooks/useHealthStatus.ts` (custom hook + context provider)

---

## 5. Dashboard — Health Detail Page

**Route:** `/health`

**Layout:** 2×2 card grid, each card representing one health signal.

### Cards

**Job Queue card:**

- Traffic light dot + title
- Numbers: Pending, Processing, Failed (1h)

**Failure Rate card:**

- Traffic light dot + title
- Numbers: Total posts (24h), Failed count, Rate percentage
- Small progress bar visualizing the rate

**Data Sources card:**

- Traffic light dot + title
- List of sources: provider name, per-source dot, "Xm ago" relative time since last poll

**Accounts card:**

- Traffic light dot + title
- List of accounts: name, platform, per-account dot, last post status

### Behavior

- Consumes data from `useHealthStatus()` context (same 30s poll as the header strip — see Section 4)
- "Last updated" timestamp at bottom
- Anchor-based scroll targets (`#queue`, `#failures`, `#polling`, `#accounts`) for header strip click-through

The `/health` page is accessible via the status dots only — no dedicated nav link in the sidebar.

**File:** `src/web/dashboard/src/pages/HealthDashboard.tsx`

---

## 6. Constants

Add to `src/shared/constants.ts`:

```typescript
export const HEALTH_THRESHOLDS = {
  JOB_QUEUE: {
    PENDING_YELLOW: 10,
    PENDING_RED: 51,
    FAILED_HOUR_YELLOW: 1,
    FAILED_HOUR_RED: 6,
  },
  FAILURE_RATE: {
    YELLOW: 0.05,
    RED: 0.15,
  },
  DATA_SOURCE: {
    OVERDUE_YELLOW_MULTIPLIER: 2,
    OVERDUE_RED_MULTIPLIER: 5,
  },
  ACCOUNTS: {
    FAILED_COUNT_YELLOW: 1, // any >= 1 failed account triggers yellow
    FAILED_RATIO_RED: 0.5,
  },
} as const;
```

---

## 7. File Changes Summary

### New Files

| File                                                     | Purpose                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| `src/web/api/health.ts`                                  | Health status API endpoint — queries, threshold logic, response assembly |
| `src/web/dashboard/src/pages/HealthDashboard.tsx`        | 2×2 card grid detail page                                                |
| `src/web/dashboard/src/components/HealthStatusStrip.tsx` | Nav bar traffic light dots                                               |
| `src/web/dashboard/src/hooks/useHealthStatus.ts`         | Shared health data hook + `HealthStatusProvider` context                 |
| `tests/e2e/health-api.test.ts`                           | E2E tests for health endpoint using pg-mem                               |

### Modified Files

| File                                          | Change                                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/shared/constants.ts`                     | Add `HEALTH_THRESHOLDS`                                                                       |
| `src/plugins/job-queue/postgres-queue.ts`     | Add `updated_at = now()` to `fail()` raw SQL SET clause                                       |
| `src/web/index.ts`                            | Move `GET /health` liveness endpoint to `GET /api/ping`. Register `/api/health/status` route. |
| `src/web/dashboard/src/App.tsx`               | Add `/health` route, wrap `Layout` with `HealthStatusProvider`                                |
| `src/web/dashboard/src/components/Layout.tsx` | Import and render `HealthStatusStrip` in the nav bar                                          |
| `src/web/dashboard/src/api-types.ts`          | Add `HealthStatusResponse` and related sub-types                                              |
| `src/web/dashboard/src/api.ts`                | Add `fetchHealthStatus()` function                                                            |

### No Changes To

- Database schema (no migrations)
- Existing dashboard pages

---

## 8. Testing

Same E2E pattern as existing tests: pg-mem database, seed data, then insert specific states to trigger each threshold. Frontend components are not tested in v1; coverage is via API-level E2E tests only.

### Test Cases

**Job Queue signal:**

- Green: 3 pending jobs, 0 failed in last hour
- Yellow: 15 pending jobs
- Yellow: 1 failed job in last hour
- Red: 60 pending jobs
- Red: 6 failed jobs in last hour

**Failure Rate signal:**

- Green: 20 attempted posts (posted+failed), 0 failed (0%)
- Yellow: 20 attempted posts, 2 failed (10%)
- Red: 20 attempted posts, 4 failed (20%)
- Edge: 0 attempted posts in 24h → green (no data = healthy)
- Edge: posts in `ready`/`skipped` status excluded from count

**Data Source Polling signal:**

- Green: all sources polled within 2× interval
- Yellow: one source at 3× overdue
- Red: one source at 6× overdue
- Red: source with `last_polled_at = NULL` (never polled)

**Account Status signal:**

- Green: all accounts' last post is 'posted'
- Green: account with no posts → treated as green
- Yellow: 1 of 3 accounts' last post is 'failed'
- Red: 2 of 3 accounts' last post is 'failed' (>50%)

**Overall status:**

- Equals worst individual signal

**Response shape:**

- Verify all fields present and correctly typed
- Verify per-item arrays (sources, accounts) match seed data

---

## 9. What's Deferred

| Feature                         | Why Deferred                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------- |
| Configurable thresholds         | YAGNI — hardcoded is fine until operators need tuning                             |
| Proactive credential validation | Separate sub-project — requires calling platform APIs to verify tokens            |
| Token expiry tracking           | Needs per-platform logic (Instagram 60-day, etc.)                                 |
| Rate limit budget monitoring    | Exists in metrics poller but not surfaced — add when metrics collection is active |
| Worker heartbeat                | Requires new inter-process signaling mechanism                                    |
| Alert/notification system       | Future — push notifications, Slack webhooks when status goes red                  |
| Historical health trends        | Future — store health snapshots over time for trend analysis                      |
