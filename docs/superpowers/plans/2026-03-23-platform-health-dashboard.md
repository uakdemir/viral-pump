# Platform Health Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operational overview dashboard — traffic-light health indicators in the nav bar + a dedicated 2x2 card grid detail page, powered by a single API endpoint that queries existing DB tables.

**Architecture:** Pure DB queries against `job_queue`, `posts`, `data_sources`, `accounts`. Single `GET /api/health/status` endpoint with 4 health signals. React context + custom hook for shared 30s polling. Existing liveness endpoint moves from `/health` to `/api/ping`.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, React, pg-mem (tests)

**Spec:** `docs/superpowers/specs/2026-03-23-platform-health-dashboard-design.md`

---

## File Map

| File                                                     | Type   | Responsibility                                       |
| -------------------------------------------------------- | ------ | ---------------------------------------------------- |
| `src/shared/constants.ts`                                | Modify | Add `HEALTH_THRESHOLDS`                              |
| `src/plugins/job-queue/postgres-queue.ts`                | Modify | Add `updated_at = now()` to `fail()`                 |
| `src/web/api/health.ts`                                  | Create | Health status endpoint — queries + threshold logic   |
| `src/web/index.ts`                                       | Modify | Move `/health` → `/api/ping`, register health routes |
| `src/web/dashboard/src/api-types.ts`                     | Modify | Add `HealthStatusResponse` types                     |
| `src/web/dashboard/src/api.ts`                           | Modify | Add `fetchHealthStatus()`                            |
| `src/web/dashboard/src/hooks/useHealthStatus.ts`         | Create | Shared polling hook + context provider               |
| `src/web/dashboard/src/components/HealthStatusStrip.tsx` | Create | Nav bar traffic light dots                           |
| `src/web/dashboard/src/components/Layout.tsx`            | Modify | Render `HealthStatusStrip` in nav                    |
| `src/web/dashboard/src/pages/HealthDashboard.tsx`        | Create | 2x2 card grid detail page                            |
| `src/web/dashboard/src/App.tsx`                          | Modify | Add `/health` route, wrap with provider              |
| `tests/e2e/health-api.test.ts`                           | Create | E2E tests for health endpoint                        |

---

### Task 1: Add HEALTH_THRESHOLDS constant and fix `fail()` updated_at

**Files:**

- Modify: `src/shared/constants.ts` (after line 44, end of file)
- Modify: `src/plugins/job-queue/postgres-queue.ts:75-86`

- [ ] **Step 1: Add HEALTH_THRESHOLDS to constants**

Append to end of `src/shared/constants.ts`:

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
    FAILED_COUNT_YELLOW: 1,
    FAILED_RATIO_RED: 0.5,
  },
} as const;
```

- [ ] **Step 2: Fix `fail()` to set `updated_at`**

In `src/plugins/job-queue/postgres-queue.ts`, add `updated_at = now()` to the SET clause in `fail()`. The current SET clause (lines 77-84) becomes:

```typescript
await this.db.execute(sql`
      UPDATE job_queue
      SET attempts = attempts + 1,
          status = CASE WHEN (attempts + 1) >= max_attempts THEN 'failed' ELSE 'pending' END,
          scheduled_at = CASE WHEN (attempts + 1) >= max_attempts THEN scheduled_at
            ELSE now() + ((attempts + 1) * interval '30 seconds') END,
          locked_by = NULL,
          locked_at = NULL,
          lease_expires_at = NULL,
          error = ${JSON.stringify(errorJson)}::jsonb,
          updated_at = now()
      WHERE id = ${jobId}
    `);
```

Only change: add `,` after the `error` line and add `updated_at = now()`.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 4: Run existing tests to verify no regressions**

Run: `npx vitest run`
Expected: All 209+ tests pass (the `fail()` change is data-only, no behavioral change)

- [ ] **Step 5: Stage and suggest commit**

Stage changed files. Suggested commit: `feat: add HEALTH_THRESHOLDS constant and fix fail() updated_at`

---

### Task 2: Health status API endpoint

**Files:**

- Create: `src/web/api/health.ts`
- Modify: `src/web/index.ts`

**Reference:** Read `src/web/api/metrics.ts` for the register function pattern. Read `src/shared/schema/job-queue.ts`, `src/shared/schema/posts.ts`, `src/shared/schema/data-sources.ts`, `src/shared/schema/accounts.ts` for column names.

- [ ] **Step 1: Create `src/web/api/health.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { eq, sql, and, inArray, count, desc } from 'drizzle-orm';
import { jobQueue } from '../../shared/schema/job-queue.js';
import { posts } from '../../shared/schema/posts.js';
import { dataSources } from '../../shared/schema/data-sources.js';
import { accounts } from '../../shared/schema/accounts.js';
import { HEALTH_THRESHOLDS } from '../../shared/constants.js';
import type { DB } from '../../shared/db.js';

type Status = 'green' | 'yellow' | 'red';

function worstStatus(...statuses: Status[]): Status {
  if (statuses.includes('red')) return 'red';
  if (statuses.includes('yellow')) return 'yellow';
  return 'green';
}

function computeJobQueueStatus(pending: number, processing: number, failedLastHour: number) {
  const t = HEALTH_THRESHOLDS.JOB_QUEUE;
  let status: Status = 'green';
  // Check red first
  if (pending >= t.PENDING_RED || failedLastHour >= t.FAILED_HOUR_RED) status = 'red';
  else if (pending >= t.PENDING_YELLOW || failedLastHour >= t.FAILED_HOUR_YELLOW) status = 'yellow';
  return { status, pending, processing, failedLastHour };
}

function computeFailureRateStatus(total24h: number, failed24h: number) {
  const rate = total24h === 0 ? 0 : failed24h / total24h;
  const t = HEALTH_THRESHOLDS.FAILURE_RATE;
  let status: Status = 'green';
  if (rate >= t.RED) status = 'red';
  else if (rate >= t.YELLOW) status = 'yellow';
  return { status, total24h, failed24h, rate };
}

function computeDataSourceStatus(
  sources: Array<{
    id: string;
    provider: string;
    lastPolledAt: Date | null;
    pollIntervalMs: number;
  }>,
) {
  const t = HEALTH_THRESHOLDS.DATA_SOURCE;
  const now = Date.now();
  const mapped = sources.map(s => {
    let itemStatus: Status = 'green';
    if (!s.lastPolledAt) {
      itemStatus = 'red';
    } else {
      const overdueMs = now - s.lastPolledAt.getTime();
      if (overdueMs >= s.pollIntervalMs * t.OVERDUE_RED_MULTIPLIER) itemStatus = 'red';
      else if (overdueMs >= s.pollIntervalMs * t.OVERDUE_YELLOW_MULTIPLIER) itemStatus = 'yellow';
    }
    return {
      id: s.id,
      provider: s.provider,
      status: itemStatus,
      lastPolledAt: s.lastPolledAt?.toISOString() ?? null,
      pollIntervalMs: s.pollIntervalMs,
    };
  });
  return {
    status: mapped.length === 0 ? ('green' as Status) : worstStatus(...mapped.map(s => s.status)),
    sources: mapped,
  };
}

function computeAccountStatus(
  accts: Array<{
    id: string;
    name: string;
    platform: string;
    lastPostStatus: string | null;
    lastPostAt: Date | null;
  }>,
) {
  const t = HEALTH_THRESHOLDS.ACCOUNTS;
  const failedCount = accts.filter(a => a.lastPostStatus === 'failed').length;
  const mapped = accts.map(a => ({
    id: a.id,
    name: a.name,
    platform: a.platform,
    status: (a.lastPostStatus === 'failed' ? 'red' : 'green') as Status,
    lastPostStatus: a.lastPostStatus,
    lastPostAt: a.lastPostAt?.toISOString() ?? null,
  }));
  let status: Status = 'green';
  if (accts.length > 0 && failedCount / accts.length >= t.FAILED_RATIO_RED) status = 'red';
  else if (failedCount >= t.FAILED_COUNT_YELLOW) status = 'yellow';
  return { status, accounts: mapped };
}

export function registerHealthRoutes(app: FastifyInstance, db: DB) {
  app.get('/api/health/status', async () => {
    // Job Queue
    const oneHourAgo = new Date(Date.now() - 3_600_000);
    const pendingProcessing = await db
      .select({ status: jobQueue.status, cnt: sql<number>`count(*)` })
      .from(jobQueue)
      .where(inArray(jobQueue.status, ['pending', 'processing']))
      .groupBy(jobQueue.status);

    const [failedRow] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(jobQueue)
      .where(and(eq(jobQueue.status, 'failed'), sql`${jobQueue.updatedAt} > ${oneHourAgo}`));

    const pending = pendingProcessing.find(r => r.status === 'pending')?.cnt ?? 0;
    const processing = pendingProcessing.find(r => r.status === 'processing')?.cnt ?? 0;
    const failedLastHour = failedRow?.cnt ?? 0;
    const jq = computeJobQueueStatus(Number(pending), Number(processing), Number(failedLastHour));

    // Failure Rate
    const twentyFourHoursAgo = new Date(Date.now() - 86_400_000);
    const postCounts = await db
      .select({ status: posts.status, cnt: sql<number>`count(*)` })
      .from(posts)
      .where(
        and(
          inArray(posts.status, ['posted', 'failed']),
          sql`${posts.createdAt} > ${twentyFourHoursAgo}`,
        ),
      )
      .groupBy(posts.status);

    const postedCount = Number(postCounts.find(r => r.status === 'posted')?.cnt ?? 0);
    const failedPostCount = Number(postCounts.find(r => r.status === 'failed')?.cnt ?? 0);
    const fr = computeFailureRateStatus(postedCount + failedPostCount, failedPostCount);

    // Data Sources
    const activeSources = await db
      .select({
        id: dataSources.id,
        provider: dataSources.provider,
        pollIntervalMs: dataSources.pollIntervalMs,
        lastPolledAt: dataSources.lastPolledAt,
      })
      .from(dataSources)
      .where(eq(dataSources.status, 'active'));
    const ds = computeDataSourceStatus(activeSources);

    // Accounts
    const activeAccounts = await db
      .select({ id: accounts.id, name: accounts.name, platform: accounts.platform })
      .from(accounts)
      .where(eq(accounts.status, 'active'));

    const acctResults = await Promise.all(
      activeAccounts.map(async a => {
        const [lastPost] = await db
          .select({ status: posts.status, createdAt: posts.createdAt })
          .from(posts)
          .where(and(eq(posts.accountId, a.id), inArray(posts.status, ['posted', 'failed'])))
          .orderBy(desc(posts.createdAt))
          .limit(1);
        return {
          id: a.id,
          name: a.name,
          platform: a.platform,
          lastPostStatus: lastPost?.status ?? null,
          lastPostAt: lastPost?.createdAt ?? null,
        };
      }),
    );
    const ac = computeAccountStatus(acctResults);

    return {
      jobQueue: jq,
      failureRate: fr,
      dataSources: ds,
      accounts: ac,
      overall: worstStatus(jq.status, fr.status, ds.status, ac.status),
    };
  });
}
```

- [ ] **Step 2: Update `src/web/index.ts` — move liveness endpoint and register health routes**

Add import at the top (after line 13):

```typescript
import { registerHealthRoutes } from './api/health.js';
```

Change line 31 (after `registerMetricsRoutes(app, db);`), add:

```typescript
registerHealthRoutes(app, db);
```

Change line 34 from:

```typescript
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
```

to:

```typescript
app.get('/api/ping', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Stage and suggest commit**

Stage changed files. Suggested commit: `feat: add health status API endpoint, move liveness to /api/ping`

---

### Task 3: E2E tests for health API

**Files:**

- Create: `tests/e2e/health-api.test.ts`

**Reference:** Read `tests/e2e/api-routes.test.ts` for the test setup pattern (Fastify `inject()`, `createTestDb()`, `seed()`). Read `tests/e2e/setup.ts` for pg-mem setup. Read `tests/e2e/seed.ts` for seed data shape.

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { createTestDb, type TestDb } from './setup.js';
import { seed } from './seed.js';
import { registerHealthRoutes } from '../../src/web/api/health.js';
import { jobQueue } from '../../src/shared/schema/job-queue.js';
import { posts } from '../../src/shared/schema/posts.js';
import { dataSources } from '../../src/shared/schema/data-sources.js';
import { accounts } from '../../src/shared/schema/accounts.js';
import { contentItems } from '../../src/shared/schema/content-items.js';
import { eq } from 'drizzle-orm';
import type { DB } from '../../src/shared/db.js';

let testDb: TestDb;
let db: DB;
let app: FastifyInstance;
let seedData: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  testDb = createTestDb();
  db = testDb.db;
  seedData = await seed(db);
  app = Fastify();
  registerHealthRoutes(app, db);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

// Clean transient data before each test — keep seed data intact
beforeEach(async () => {
  await db.execute(sql`DELETE FROM posts`);
  await db.execute(sql`DELETE FROM content_items`);
  await db.execute(sql`DELETE FROM job_queue`);
  // Reset data source lastPolledAt to recent (green)
  await db
    .update(dataSources)
    .set({ lastPolledAt: new Date() })
    .where(eq(dataSources.id, seedData.dataSource.id));
  // Remove any extra accounts added by tests (keep only the 2 from seed)
  await db.execute(
    sql`DELETE FROM accounts WHERE id NOT IN (${seedData.twitterAccount.id}, ${seedData.instagramAccount.id})`,
  );
});

// ─── Helpers ─────────────────────────────────────────────

async function getHealth() {
  const res = await app.inject({ method: 'GET', url: '/api/health/status' });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.payload);
}

async function insertJob(status: string, updatedAt?: Date) {
  await db.insert(jobQueue).values({
    type: 'test-job',
    payload: {},
    status,
    updatedAt: updatedAt ?? new Date(),
  });
}

async function insertPost(accountId: string, status: string, createdAt?: Date) {
  const [ci] = await db
    .insert(contentItems)
    .values({
      verticalId: seedData.vertical.id,
      generationStatus: 'ready',
      reviewStatus: 'approved',
    })
    .returning();
  await db.insert(posts).values({
    contentId: ci.id,
    accountId,
    status,
    createdAt: createdAt ?? new Date(),
  });
}

// ─── Job Queue Signal ────────────────────────────────────

describe('Job Queue signal', () => {
  it('returns green when no jobs', async () => {
    const health = await getHealth();
    expect(health.jobQueue.status).toBe('green');
    expect(health.jobQueue.pending).toBe(0);
    expect(health.jobQueue.failedLastHour).toBe(0);
  });

  it('returns yellow when pending >= 10', async () => {
    for (let i = 0; i < 15; i++) await insertJob('pending');
    const health = await getHealth();
    expect(health.jobQueue.status).toBe('yellow');
    expect(health.jobQueue.pending).toBe(15);
  });

  it('returns yellow when 1 failed in last hour', async () => {
    await insertJob('failed', new Date());
    const health = await getHealth();
    expect(health.jobQueue.failedLastHour).toBe(1);
    expect(health.jobQueue.status).toBe('yellow');
  });

  it('returns red when pending >= 51', async () => {
    for (let i = 0; i < 51; i++) await insertJob('pending');
    const health = await getHealth();
    expect(health.jobQueue.status).toBe('red');
    expect(health.jobQueue.pending).toBe(51);
  });

  it('returns red when >= 6 failed in last hour', async () => {
    for (let i = 0; i < 6; i++) await insertJob('failed', new Date());
    const health = await getHealth();
    expect(health.jobQueue.status).toBe('red');
    expect(health.jobQueue.failedLastHour).toBe(6);
  });
});

// ─── Failure Rate Signal ─────────────────────────────────

describe('Failure Rate signal', () => {
  it('returns green when no attempted posts', async () => {
    const health = await getHealth();
    expect(health.failureRate.status).toBe('green');
    expect(health.failureRate.total24h).toBe(0);
    expect(health.failureRate.rate).toBe(0);
  });

  it('returns green when 0% failure rate', async () => {
    for (let i = 0; i < 20; i++) await insertPost(seedData.twitterAccount.id, 'posted');
    const health = await getHealth();
    expect(health.failureRate.status).toBe('green');
    expect(health.failureRate.total24h).toBe(20);
    expect(health.failureRate.rate).toBe(0);
  });

  it('returns yellow when 10% failure rate', async () => {
    for (let i = 0; i < 18; i++) await insertPost(seedData.twitterAccount.id, 'posted');
    for (let i = 0; i < 2; i++) await insertPost(seedData.twitterAccount.id, 'failed');
    const health = await getHealth();
    expect(health.failureRate.status).toBe('yellow');
    expect(health.failureRate.total24h).toBe(20);
    expect(health.failureRate.rate).toBeCloseTo(0.1, 1);
  });

  it('returns red when 20% failure rate', async () => {
    for (let i = 0; i < 16; i++) await insertPost(seedData.twitterAccount.id, 'posted');
    for (let i = 0; i < 4; i++) await insertPost(seedData.twitterAccount.id, 'failed');
    const health = await getHealth();
    expect(health.failureRate.status).toBe('red');
    expect(health.failureRate.total24h).toBe(20);
  });

  it('excludes ready and skipped posts from count', async () => {
    for (let i = 0; i < 10; i++) await insertPost(seedData.twitterAccount.id, 'ready');
    for (let i = 0; i < 10; i++) await insertPost(seedData.twitterAccount.id, 'skipped');
    const health = await getHealth();
    expect(health.failureRate.total24h).toBe(0);
    expect(health.failureRate.status).toBe('green');
  });
});

// ─── Data Source Polling Signal ──────────────────────────

describe('Data Source Polling signal', () => {
  it('returns green when sources polled within 2x interval', async () => {
    // beforeEach already sets lastPolledAt to now()
    const health = await getHealth();
    expect(health.dataSources.status).toBe('green');
  });

  it('returns yellow when a source is >2x overdue', async () => {
    const overdue = new Date(Date.now() - 180_000); // 3x overdue (60s * 3)
    await db
      .update(dataSources)
      .set({ lastPolledAt: overdue })
      .where(eq(dataSources.id, seedData.dataSource.id));
    const health = await getHealth();
    expect(health.dataSources.status).toBe('yellow');
  });

  it('returns red when a source is >5x overdue', async () => {
    const overdue = new Date(Date.now() - 360_000); // 6x overdue (60s * 6)
    await db
      .update(dataSources)
      .set({ lastPolledAt: overdue })
      .where(eq(dataSources.id, seedData.dataSource.id));
    const health = await getHealth();
    expect(health.dataSources.status).toBe('red');
  });

  it('returns red when source has never been polled', async () => {
    await db
      .update(dataSources)
      .set({ lastPolledAt: null })
      .where(eq(dataSources.id, seedData.dataSource.id));
    const health = await getHealth();
    expect(health.dataSources.status).toBe('red');
  });
});

// ─── Account Status Signal ───────────────────────────────

describe('Account Status signal', () => {
  it('returns green when all accounts last post succeeded', async () => {
    await insertPost(seedData.twitterAccount.id, 'posted');
    await insertPost(seedData.instagramAccount.id, 'posted');
    const health = await getHealth();
    expect(health.accounts.status).toBe('green');
  });

  it('returns green when account has no posts', async () => {
    // Both seed accounts have no posts (cleaned by beforeEach)
    const health = await getHealth();
    expect(health.accounts.status).toBe('green');
    const twitterAcct = health.accounts.accounts.find(
      (a: { name: string }) => a.name === 'Test Twitter',
    );
    expect(twitterAcct.lastPostStatus).toBeNull();
  });

  it('returns yellow when 1 of 3 accounts last post failed', async () => {
    // Add third account
    const [acct3] = await db
      .insert(accounts)
      .values({
        verticalId: seedData.vertical.id,
        name: 'Test Pinterest',
        platform: 'pinterest',
        language: 'en',
        market: 'us',
        credentials: {},
        config: { postingStrategy: 'pinterest-api', dryRun: true },
      })
      .returning();
    await insertPost(seedData.twitterAccount.id, 'posted');
    await insertPost(seedData.instagramAccount.id, 'posted');
    await insertPost(acct3.id, 'failed');
    const health = await getHealth();
    expect(health.accounts.status).toBe('yellow');
  });

  it('returns red when >= 50% of accounts last post failed', async () => {
    // 2 seed accounts, both failed → 100% → red
    await insertPost(seedData.twitterAccount.id, 'failed');
    await insertPost(seedData.instagramAccount.id, 'failed');
    const health = await getHealth();
    expect(health.accounts.status).toBe('red');
  });
});

// ─── Overall Status ──────────────────────────────────────

describe('Overall status', () => {
  it('equals worst individual signal', async () => {
    // Force data source to red (never polled), everything else green
    await db
      .update(dataSources)
      .set({ lastPolledAt: null })
      .where(eq(dataSources.id, seedData.dataSource.id));
    const health = await getHealth();
    expect(health.overall).toBe('red');
    expect(health.dataSources.status).toBe('red');
  });
});

// ─── Response Shape ──────────────────────────────────────

describe('Response shape', () => {
  it('returns all expected fields', async () => {
    const health = await getHealth();
    expect(health).toHaveProperty('jobQueue');
    expect(health).toHaveProperty('failureRate');
    expect(health).toHaveProperty('dataSources');
    expect(health).toHaveProperty('accounts');
    expect(health).toHaveProperty('overall');
    expect(health.jobQueue).toHaveProperty('status');
    expect(health.jobQueue).toHaveProperty('pending');
    expect(health.jobQueue).toHaveProperty('processing');
    expect(health.jobQueue).toHaveProperty('failedLastHour');
    expect(health.failureRate).toHaveProperty('rate');
    expect(Array.isArray(health.dataSources.sources)).toBe(true);
    expect(Array.isArray(health.accounts.accounts)).toBe(true);
  });
});
```

**Note:** The `beforeEach` truncates `posts`, `content_items`, and `job_queue` before each test and resets data source polling to recent + removes extra accounts. This ensures each test starts from a clean state with only the 2 seed accounts and 1 data source. If pg-mem doesn't support `DELETE FROM <table>` syntax, replace with Drizzle's `db.delete(posts)` etc.

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/e2e/health-api.test.ts`
Expected: All tests pass. If pg-mem has issues with specific queries (e.g., `count(*)` casting), fix the query or register needed pg-mem functions in `setup.ts`.

- [ ] **Step 3: Run full test suite to verify no regressions**

Run: `npx vitest run`
Expected: All tests pass (existing 209+ plus new health tests)

- [ ] **Step 4: Stage and suggest commit**

Stage changed files. Suggested commit: `test: add E2E tests for health status API endpoint`

---

### Task 4: Dashboard types and API client

**Files:**

- Modify: `src/web/dashboard/src/api-types.ts` (append after line 198)
- Modify: `src/web/dashboard/src/api.ts` (append after line 84)

- [ ] **Step 1: Add types to `api-types.ts`**

Append to end of file:

```typescript
// ---------------------------------------------------------------------------
// /api/health/status — GET response
// ---------------------------------------------------------------------------

export interface HealthSignalStatus {
  status: 'green' | 'yellow' | 'red';
}

export interface JobQueueHealth extends HealthSignalStatus {
  pending: number;
  processing: number;
  failedLastHour: number;
}

export interface FailureRateHealth extends HealthSignalStatus {
  total24h: number;
  failed24h: number;
  rate: number;
}

export interface DataSourceHealth {
  id: string;
  provider: string;
  status: 'green' | 'yellow' | 'red';
  lastPolledAt: string | null;
  pollIntervalMs: number;
}

export interface DataSourcesHealth extends HealthSignalStatus {
  sources: DataSourceHealth[];
}

export interface AccountHealth {
  id: string;
  name: string;
  platform: string;
  status: 'green' | 'yellow' | 'red';
  lastPostStatus: string | null;
  lastPostAt: string | null;
}

export interface AccountsHealth extends HealthSignalStatus {
  accounts: AccountHealth[];
}

export interface HealthStatusResponse {
  jobQueue: JobQueueHealth;
  failureRate: FailureRateHealth;
  dataSources: DataSourcesHealth;
  accounts: AccountsHealth;
  overall: 'green' | 'yellow' | 'red';
}
```

- [ ] **Step 2: Add `fetchHealthStatus` to `api.ts`**

Add import at top of `api.ts`:

```typescript
import type { HealthStatusResponse } from './api-types.js';
```

(Merge into the existing import statement.)

Append to end of file:

```typescript
// Health Status
export async function fetchHealthStatus(): Promise<HealthStatusResponse> {
  const res = await fetch(`${BASE}/api/health/status`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (dashboard is a separate tsconfig but still check)

- [ ] **Step 4: Stage and suggest commit**

Stage changed files. Suggested commit: `feat: add HealthStatusResponse types and fetchHealthStatus API client`

---

### Task 5: useHealthStatus hook and context provider

**Files:**

- Create: `src/web/dashboard/src/hooks/useHealthStatus.ts`

**Reference:** Read `src/web/dashboard/src/api.ts` for the `fetchHealthStatus` function.

- [ ] **Step 1: Create the hook file**

```typescript
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { HealthStatusResponse } from '../api-types.js';
import { fetchHealthStatus } from '../api.js';

interface HealthState {
  data: HealthStatusResponse | null;
  error: boolean;
  lastUpdated: Date | null;
}

const HealthStatusContext = createContext<HealthState>({
  data: null,
  error: false,
  lastUpdated: null,
});

export function HealthStatusProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<HealthState>({ data: null, error: false, lastUpdated: null });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const data = await fetchHealthStatus();
      setState({ data, error: false, lastUpdated: new Date() });
    } catch {
      setState(prev => ({ ...prev, error: true }));
    }
  }, []);

  useEffect(() => {
    poll(); // Fetch immediately on mount
    intervalRef.current = setInterval(poll, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll]);

  return React.createElement(HealthStatusContext.Provider, { value: state }, children);
}

export function useHealthStatus(): HealthState {
  return useContext(HealthStatusContext);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Stage and suggest commit**

Stage changed files. Suggested commit: `feat: add useHealthStatus hook and HealthStatusProvider context`

---

### Task 6: HealthStatusStrip component and Layout integration

**Files:**

- Create: `src/web/dashboard/src/components/HealthStatusStrip.tsx`
- Modify: `src/web/dashboard/src/components/Layout.tsx`

**Reference:** Read `src/web/dashboard/src/components/Layout.tsx` for the nav bar structure (lines 42-71).

- [ ] **Step 1: Create `HealthStatusStrip.tsx`**

```typescript
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useHealthStatus } from '../hooks/useHealthStatus.js';

const dotColors: Record<string, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
};

const stripStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginLeft: '16px',
};

const dotGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: '4px',
};

const dotStyle = (color: string): React.CSSProperties => ({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor: color,
  flexShrink: 0,
});

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#94a3b8',
  fontWeight: 500,
};

interface Signal {
  key: string;
  label: string;
  hash: string;
  tooltip: string;
  status: string;
}

export function HealthStatusStrip() {
  const { data, error } = useHealthStatus();
  const navigate = useNavigate();

  if (error || !data) {
    return (
      <div style={stripStyle} title="Health check unavailable">
        {['Queue', 'Failures', 'Polling', 'Accounts'].map(label => (
          <div key={label} style={dotGroupStyle}>
            <span style={dotStyle('#64748b')} />
            <span className="health-label" style={labelStyle}>{label}</span>
          </div>
        ))}
      </div>
    );
  }

  const signals: Signal[] = [
    {
      key: 'queue', label: 'Queue', hash: '#queue',
      tooltip: `${data.jobQueue.pending} pending, ${data.jobQueue.failedLastHour} failed/hr`,
      status: data.jobQueue.status,
    },
    {
      key: 'failures', label: 'Failures', hash: '#failures',
      tooltip: `${data.failureRate.failed24h}/${data.failureRate.total24h} failed (${Math.round(data.failureRate.rate * 100)}%)`,
      status: data.failureRate.status,
    },
    {
      key: 'polling', label: 'Polling', hash: '#polling',
      tooltip: `${data.dataSources.sources.length} sources`,
      status: data.dataSources.status,
    },
    {
      key: 'accounts', label: 'Accounts', hash: '#accounts',
      tooltip: `${data.accounts.accounts.length} accounts`,
      status: data.accounts.status,
    },
  ];

  return (
    <div style={stripStyle}>
      {signals.map(s => (
        <div
          key={s.key}
          style={dotGroupStyle}
          title={s.tooltip}
          onClick={() => navigate(`/health${s.hash}`)}
        >
          <span style={dotStyle(dotColors[s.status] ?? '#64748b')} />
          <span className="health-label" style={labelStyle}>{s.label}</span>
        </div>
      ))}

      <style>{`
        @media (max-width: 640px) {
          .health-label { display: none !important; }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Add HealthStatusStrip to Layout nav bar**

In `src/web/dashboard/src/components/Layout.tsx`, add import at top:

```typescript
import { HealthStatusStrip } from './HealthStatusStrip.js';
```

Insert `<HealthStatusStrip />` between the desktop-nav div (line 58 closing `</div>`) and the mobile hamburger button (line 61). The nav section becomes:

```tsx
        {/* Desktop nav */}
        <div className="desktop-nav" style={{ display: 'flex', gap: '4px' }}>
          <NavLink to="/review" style={({ isActive }) => isActive ? activeLinkStyle : linkStyle}>
            Review Queue
          </NavLink>
          <NavLink to="/posts" style={({ isActive }) => isActive ? activeLinkStyle : linkStyle}>
            Posts
          </NavLink>
          <NavLink to="/verticals" style={({ isActive }) => isActive ? activeLinkStyle : linkStyle}>
            Verticals
          </NavLink>
        </div>

        <HealthStatusStrip />

        {/* Mobile hamburger */}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Stage and suggest commit**

Stage changed files. Suggested commit: `feat: add HealthStatusStrip component and integrate into Layout nav bar`

---

### Task 7: HealthDashboard page and App.tsx routing

**Files:**

- Create: `src/web/dashboard/src/pages/HealthDashboard.tsx`
- Modify: `src/web/dashboard/src/App.tsx`

**Reference:** Read `src/web/dashboard/src/pages/PostMonitor.tsx` for the existing page component pattern.

- [ ] **Step 1: Create `HealthDashboard.tsx`**

```typescript
import React from 'react';
import { useHealthStatus } from '../hooks/useHealthStatus.js';

const dotColors: Record<string, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
  gap: '16px',
  marginTop: '16px',
};

const cardStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '20px',
};

const cardTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '16px',
  fontWeight: 600,
  color: '#f1f5f9',
  marginBottom: '12px',
};

const dot = (status: string): React.CSSProperties => ({
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  backgroundColor: dotColors[status] ?? '#64748b',
  flexShrink: 0,
});

const metricRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '4px 0',
  fontSize: '14px',
  color: '#cbd5e1',
};

const barOuter: React.CSSProperties = {
  height: '6px',
  background: '#334155',
  borderRadius: '3px',
  marginTop: '8px',
  overflow: 'hidden',
};

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

export function HealthDashboard() {
  const { data, error, lastUpdated } = useHealthStatus();

  if (error || !data) {
    return (
      <div>
        <h1 style={{ color: '#f1f5f9', fontSize: '24px', fontWeight: 700 }}>System Health</h1>
        <p style={{ color: '#94a3b8', marginTop: '16px' }}>Health check unavailable.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ color: '#f1f5f9', fontSize: '24px', fontWeight: 700 }}>System Health</h1>

      <div style={gridStyle}>
        {/* Job Queue Card */}
        <div id="queue" style={cardStyle}>
          <div style={cardTitleStyle}>
            <span style={dot(data.jobQueue.status)} />
            Job Queue
          </div>
          <div style={metricRow}><span>Pending</span><span>{data.jobQueue.pending}</span></div>
          <div style={metricRow}><span>Processing</span><span>{data.jobQueue.processing}</span></div>
          <div style={metricRow}><span>Failed (1h)</span><span>{data.jobQueue.failedLastHour}</span></div>
        </div>

        {/* Failure Rate Card */}
        <div id="failures" style={cardStyle}>
          <div style={cardTitleStyle}>
            <span style={dot(data.failureRate.status)} />
            Failure Rate
          </div>
          <div style={metricRow}><span>Posts (24h)</span><span>{data.failureRate.total24h}</span></div>
          <div style={metricRow}><span>Failed</span><span>{data.failureRate.failed24h}</span></div>
          <div style={metricRow}><span>Rate</span><span>{Math.round(data.failureRate.rate * 100)}%</span></div>
          <div style={barOuter}>
            <div style={{
              height: '100%',
              width: `${Math.min(data.failureRate.rate * 100, 100)}%`,
              background: dotColors[data.failureRate.status] ?? '#64748b',
              borderRadius: '3px',
              transition: 'width 0.3s',
            }} />
          </div>
        </div>

        {/* Data Sources Card */}
        <div id="polling" style={cardStyle}>
          <div style={cardTitleStyle}>
            <span style={dot(data.dataSources.status)} />
            Data Sources
          </div>
          {data.dataSources.sources.map(s => (
            <div key={s.id} style={metricRow}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={dot(s.status)} />
                {s.provider}
              </span>
              <span>{timeAgo(s.lastPolledAt)}</span>
            </div>
          ))}
          {data.dataSources.sources.length === 0 && (
            <p style={{ color: '#64748b', fontSize: '14px' }}>No active data sources</p>
          )}
        </div>

        {/* Accounts Card */}
        <div id="accounts" style={cardStyle}>
          <div style={cardTitleStyle}>
            <span style={dot(data.accounts.status)} />
            Accounts
          </div>
          {data.accounts.accounts.map(a => (
            <div key={a.id} style={metricRow}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={dot(a.status)} />
                {a.name}
              </span>
              <span style={{ textTransform: 'capitalize' }}>{a.lastPostStatus ?? 'no posts'}</span>
            </div>
          ))}
          {data.accounts.accounts.length === 0 && (
            <p style={{ color: '#64748b', fontSize: '14px' }}>No active accounts</p>
          )}
        </div>
      </div>

      {lastUpdated && (
        <p style={{ color: '#64748b', fontSize: '12px', marginTop: '16px', textAlign: 'right' }}>
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `App.tsx` — add route and wrap with provider**

Replace the entire content of `src/web/dashboard/src/App.tsx`:

```typescript
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { ReviewQueue } from './pages/ReviewQueue.js';
import { PostMonitor } from './pages/PostMonitor.js';
import { VerticalManagement } from './pages/VerticalManagement.js';
import { HealthDashboard } from './pages/HealthDashboard.js';
import { HealthStatusProvider } from './hooks/useHealthStatus.js';

export function App() {
  return (
    <HealthStatusProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/review" replace />} />
          <Route path="/review" element={<ReviewQueue />} />
          <Route path="/posts" element={<PostMonitor />} />
          <Route path="/verticals" element={<VerticalManagement />} />
          <Route path="/health" element={<HealthDashboard />} />
        </Routes>
      </Layout>
    </HealthStatusProvider>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Stage and suggest commit**

Stage changed files. Suggested commit: `feat: add HealthDashboard page and wire up routing with HealthStatusProvider`

---

### Task 8: Final verification

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Zero errors

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing + new health API tests)

- [ ] **Step 3: Stage all changed files and suggest final commit**

Stage all new/modified files listed in the File Map. Suggested commit: `feat: platform health dashboard — API, nav strip, detail page, E2E tests`

**Note:** If earlier tasks were committed individually, this step may have nothing to stage. It serves as a final catch-all.
