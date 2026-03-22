# E2E Test Infrastructure — Design Spec

**Date:** 2026-03-21
**Scope:** Automated smoke/E2E tests using pg-mem for dry-run pipeline, error handling, and dashboard API routes
**Goal:** Core dry-run pipeline, error handling, and dashboard API contracts can be smoke-tested with `npm run test:e2e` without external dependencies (no Docker, no API keys, no running Postgres)

---

## 1. Test Infrastructure Foundation

### 1.1 pg-mem Setup

Use `pg-mem` to create an in-memory PostgreSQL instance per test file. Apply the Drizzle schema at setup time. Each test file gets a fresh database — no cross-test state leakage.

**`tests/e2e/setup.ts`** — Shared helper:

- `createTestDb()`: Creates a `pg-mem` instance, applies all table definitions from `src/shared/schema/`, returns a Drizzle DB instance
- Registers pg-mem built-in functions: `uuid_generate_v4()`, `gen_random_uuid()`, `now()`, `COALESCE`
- Registers `jsonb` operators used by the codebase (`->>'key'`, `::int` casts)
- Returns the Drizzle `db` instance (typed via `drizzle-orm/node-postgres` adapter) and a `close()` function
- **DB type compatibility:** The current `DB` type is `ReturnType<typeof createDb>` which resolves to `PostgresJsDatabase<typeof schema>`. For test compatibility, `createTestDb()` will use pg-mem's `newDb().adapters.createPg()` to get a `pg`-compatible `Pool`, then pass it to Drizzle's `drizzle-orm/node-postgres` adapter. The production `DB` type must accept both adapters. Concrete approach: change `src/shared/db.ts` to export `type DB = PostgresJsDatabase<typeof schema>` explicitly, and have `createTestDb()` return its own typed instance. Handler functions and routes accept `db: DB` — the implementer must verify at implementation time that the pg-mem Drizzle instance is assignable to this type. If not, introduce a minimal `type DB = { select: ..., insert: ..., update: ..., execute: ... }` interface that both adapters satisfy. The exact approach depends on Drizzle version compatibility and will be finalized during implementation of `tests/e2e/setup.ts`.

### 1.5 pg-mem Compatibility Strategy

Several parts of the codebase use raw SQL that pg-mem may not support fully:

| Component                               | Raw SQL Feature                               | Strategy                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PostgresJobQueue.dequeue()`            | `FOR UPDATE SKIP LOCKED`                      | Use `InMemoryJobQueue` (see below)                                                                                                                                                                                                                                                                                                       |
| `PostgresJobQueue.fail()`               | `CASE WHEN`, interval arithmetic              | Use `InMemoryJobQueue`                                                                                                                                                                                                                                                                                                                   |
| `Scheduler.claimAndFireScheduledRule()` | `FOR UPDATE SKIP LOCKED`, raw transaction     | **Out of scope for this milestone.** The scheduled pipeline E2E test (Section 2.3) simulates the scheduler's output by directly creating events, bypassing the claim SQL. A separate `tests/worker/scheduler.test.ts` covering the transactional claim/advance logic against a real Postgres instance should be added as a backlog item. |
| `JobReaper.reap()`                      | Raw `UPDATE ... WHERE now()`                  | Test the reaper's SQL directly against pg-mem — the query is simple enough. If pg-mem rejects `now()`, register it as a function.                                                                                                                                                                                                        |
| Posts API summary                       | `COALESCE`, `SUM`, `(metrics->>'views')::int` | Test against pg-mem — register jsonb `->>'key'` operator and `::int` cast. This route MUST be tested with real SQL per the success criteria.                                                                                                                                                                                             |

**`InMemoryJobQueue`** — Implements the `JobQueue` interface in pure TypeScript (array-backed). Used in pipeline and error handling E2E tests. The `InMemoryJobQueue` stores jobs in memory with `enqueue()`, `dequeue()`, `complete()`, `fail()`, and exposes `getAll()` for assertions.

**Note:** There are currently no unit tests for `PostgresJobQueue`'s `FOR UPDATE SKIP LOCKED` dequeue/fail SQL semantics. This is a known gap. A separate `tests/worker/postgres-job-queue.test.ts` against a real Postgres instance should be added as a backlog item. The E2E tests in this milestone verify pipeline wiring through the `JobQueue` interface, not the SQL implementation.

**File:** `tests/e2e/in-memory-job-queue.ts`

### 1.2 Seed Data

**`tests/e2e/seed.ts`** — Minimal seed function inserting all required `notNull` fields:

- 1 vertical: `{ name: 'Test Vertical', slug: 'test-vertical' }`
- 2 accounts:
  - `{ verticalId, name: 'Test Twitter', platform: 'twitter', language: 'en', market: 'us', credentials: {}, config: { postingStrategy: 'twitter-api', dryRun: true }, status: 'active' }`
  - `{ verticalId, name: 'Test Instagram', platform: 'instagram', language: 'en', market: 'us', credentials: {}, config: { postingStrategy: 'instagram-api', dryRun: true }, status: 'active' }`
- 1 data source: `{ verticalId, provider: 'coingecko', config: { coinId: 'bitcoin' } }`
- 1 trigger rule: `{ verticalId, name: 'Test BTC Rule', fireMode: 'threshold_cross', condition: { match: { source: 'coingecko', type: 'price_update' }, predicates: [{ field: 'changePct', op: 'gte', value: 0.001 }] }, contentConfig: { templateNames: ['test-generic-template'], templateSelection: 'named' } }`
- 2 content templates:
  - Generic: `{ verticalId, name: 'test-generic-template', category: 'alert', contentLayer: 'text+image', platform: null, promptTemplate: 'Write about {{eventData}}' }`
  - Instagram-specific: `{ verticalId, name: 'test-instagram-template', category: 'alert', contentLayer: 'text+image', platform: 'instagram', promptTemplate: 'Write an Instagram post about {{eventData}}' }`

Returns all inserted rows with IDs for test assertions.

### 1.3 Plugin Mocks

**`tests/e2e/mocks.ts`** — Fake plugins and dependency factories:

**Fake plugins (registered in plugin registries):**

- **FakeContentGenerator**: Returns canned `{ text: 'Test content about price movement', tags: ['test', 'automated'] }`. Configurable to throw for error tests.
- **FakeVisualGenerator**: Returns `{ filePath: '/tmp/test-visual.png', width: 1200, height: 628, mimeType: 'image/png', fileSizeBytes: 1024 }`. Configurable to throw for error tests.
- **FakeAssetStore**: `store()` returns a fake path, `resolve()` returns a fake local path, `getPublicUrl()` returns a fake URL. No real filesystem writes.
- **FakePostingStrategy**: Implements `PostingStrategy` with `validateInput()` that passes and `post()` that returns a fake `{ platformPostId, postedAt, url }`. Used for non-dry-run strategy resolution tests.

**Handler dependency factories:**

- `createGenerateContentDeps(db, jobQueue, overrides?)`: Builds a `GenerateContentDeps` object — registers `FakeContentGenerator` in a fresh `PluginRegistry<ContentGenerator>`, wires in the logger. Overrides allow swapping in a failing generator.
- `createGenerateVisualDeps(db, overrides?)`: Builds `GenerateVisualDeps` — wires `FakeVisualGenerator` and `FakeAssetStore`. Overrides allow failing generator.
- `createPostToPlatformDeps(db, jobQueue, overrides?)`: Builds `PostToPlatformDeps` — registers platform strategies in a fresh `PluginRegistry<PostingStrategy>`, wires `FakeAssetStore`, sets `assetDir` to `$TMPDIR/viral-test`. Overrides allow custom registries.

**DryRunPostingStrategy filesystem handling:** The real `DryRunPostingStrategy` writes JSON files to disk. For E2E tests, set `assetDir` to `$TMPDIR/viral-test/` and add `afterAll` cleanup in each test file. This is accepted as a minor side effect — the dry-run writes are small and the tmp dir is cleaned up.

All mocks are created via factory functions so each test can configure behavior (success, failure, custom response).

### 1.4 Test Runner Configuration

- E2E tests live under `tests/e2e/`
- `npm run test:e2e` — runs only `tests/e2e/**/*.test.ts`
- `npm run test:unit` — runs `tests/` excluding `tests/e2e/`
- `npm test` — runs all tests (unit + e2e)
- Each test file creates its own `pg-mem` instance via `createTestDb()` — fully isolated

---

## 2. Pipeline E2E Tests

**File:** `tests/e2e/pipeline.test.ts`

### 2.1 Seed Validation

After seeding, verify:

- Vertical exists with correct slug
- Both accounts exist, both have `dryRun: true`
- Trigger rule exists with correct fire mode
- Both templates exist (one generic, one Instagram-specific)
- Job queue is empty

### 2.2 Event-Driven Pipeline (Full Dry-Run)

End-to-end test of: event → content → visual → review → posting.

1. Create a `DetectedEvent`: `{ source: 'coingecko', type: 'price_update', verticalId, observedAt: new Date(), data: { changePct: 5.2, direction: 'up' }, rawPayload: {} }`
2. Call `EventDetector.processEvents([event], verticalId)` — verify `generate-content` job enqueued in the `InMemoryJobQueue`
3. Dequeue and run `handleGenerateContent` with full deps (via `createGenerateContentDeps()`) — verify:
   - Content item created: `generationStatus = 'ready'`, `reviewStatus = 'pending'`
   - `generate-visual` job enqueued
4. Dequeue and run `handleGenerateVisual` with full deps (via `createGenerateVisualDeps()`) — verify:
   - `mediaMeta` populated (mimeType, width, height, fileSizeBytes)
   - `reviewStatus = 'pending'` (ready for review)
5. Call `approveContent()` — verify:
   - `reviewStatus = 'approved'`, `reviewedAt` set
   - Posts created for both accounts (Twitter + Instagram — both image-compatible)
   - `post-to-platform` jobs enqueued
6. Dequeue and run `handlePostToPlatform` with full deps (via `createPostToPlatformDeps()`) for each — verify:
   - All posts: `status = 'posted'`, `platformPostId` starts with `dry-run-`

### 2.3 Scheduled Pipeline

The `Scheduler.checkScheduledTriggers()` method is currently private and uses `FOR UPDATE SKIP LOCKED` raw SQL. Rather than testing the scheduler's internal claim logic (which uses raw SQL incompatible with pg-mem), test the scheduled pipeline by:

1. Seed a scheduled trigger rule with `next_scheduled_at` in the past and `fire_mode: 'scheduled'`
2. Directly simulate what the scheduler does: query the due rule, create a `DetectedEvent` with `source: 'scheduled'`, call `EventDetector.processEvents()`
3. Verify `generate-content` job enqueued in `InMemoryJobQueue`
4. Run through content generation → approval → posting (same as 2.2)
5. Manually advance `next_scheduled_at` and verify it's in the future (the cron-advance logic can be tested as a unit test of `CronExpressionParser`)

This tests the scheduled content pipeline without depending on the scheduler's raw SQL claim logic.

### 2.4 Review Workflow

Three sub-tests:

- **Approve**: Content goes from `pending` → `approved`, posts created for compatible accounts
- **Edit + Approve**: `finalText` saved (different from `generatedText`), posts reference `finalText`
- **Reject**: Content goes to `rejected`, zero posts created, rejection notes saved

### 2.5 Platform Routing

Two sub-tests:

- **Generic template** (platform = NULL) with image content: posts created for BOTH Twitter and Instagram accounts
- **Instagram-specific template**: post created for Instagram account ONLY, not Twitter

---

## 3. Error Handling E2E Tests

**File:** `tests/e2e/error-handling.test.ts`

### 3.1 LLM Generation Failure

- Seed a content item in `generationStatus = 'generating'` state (or enqueue a generate-content job and let the handler create it)
- Use `createGenerateContentDeps(db, jobQueue, { failGenerator: true })` to wire a throwing FakeContentGenerator
- Run `handleGenerateContent` with the failing deps
- Verify: content item `generationStatus = 'failed'`, no `generate-visual` job enqueued in `InMemoryJobQueue`

### 3.2 Visual Generation Failure

- Seed a content item in `generationStatus = 'generating'` with `generatedText` already set
- Use `createGenerateVisualDeps(db, { failGenerator: true })` to wire a throwing FakeVisualGenerator
- Run `handleGenerateVisual` with the failing deps
- Verify: content item `generationStatus = 'failed'`

### 3.3 Unknown Posting Strategy

- Set account `config.postingStrategy = 'nonexistent-api'`
- Approve content, run `handlePostToPlatform`
- Verify: post `status = 'failed'`, `failureReason` contains "Unknown posting strategy"
- Verify: job is NOT re-enqueued (config error, not transient)

### 3.4 Retry Flow

- From 3.3's failed post, call `POST /api/posts/:id/retry`
- Verify: post reset to `status = 'ready'`, `failureReason = null`, new job enqueued
- Fix the account's strategy back to valid, run the job
- Verify: post `status = 'posted'` with `dry-run-*` ID

### 3.5 Job Reaper

- Insert a job with `status = 'processing'` and `lease_expires_at` 10 minutes in the past
- Run the job reaper
- Verify: job reset to `status = 'pending'`

### 3.6 Concurrent Safety

- Attempt to insert two posts with the same `(contentId, accountId)` pair
- Verify: unique constraint violation thrown on the second insert

---

## 4. Dashboard API Route Tests

**File:** `tests/e2e/api-routes.test.ts`

Uses Fastify's `inject()` method against a real Fastify instance with routes registered against `pg-mem`.

### 4.1 GET /api/posts

Seed posted + failed posts across two platforms and one vertical.

- **Bare array**: `GET /api/posts?status=posted` returns a plain JSON array (backward compat)
- **Summary**: `GET /api/posts?status=posted&summary=true` returns `{ items, summary }` with correct `totalPosts`, `totalViews`, `totalLikes`, `totalShares`, `totalComments`
- **Platform filter**: `?platform=twitter` returns only Twitter posts
- **Vertical filter**: `?vertical=test-vertical` returns only matching vertical
- **Date filter**: `?since=<date>&until=<date>` respects range

### 4.2 GET /api/posts/:id/metrics-history

- Seed a post with 3 metrics snapshots at different times
- Verify: returns `{ postId, snapshots }` with snapshots ordered by `collectedAt` ascending
- Empty case: post with no snapshots returns `{ postId, snapshots: [] }`

### 4.3 POST /api/posts/:id/retry

- **404**: Non-existent post ID → 404
- **409**: Post with `status = 'posted'` → 409
- **200**: Failed post → resets to `ready`, enqueues job

### 4.4 GET /api/content-items

- Seed pending + approved content items
- `?status=pending` returns only pending items

### 4.5 POST /api/content-items/:id/approve

- Approve a pending content item via the API
- Verify: `reviewStatus = 'approved'`, posts created for compatible accounts

---

## 5. NPM Scripts & Dependencies

### 5.1 New Package

```bash
npm install -D pg-mem
```

### 5.2 Updated Scripts

Keep existing `"test": "vitest"` (watch mode) and `"test:run": "vitest run"` unchanged. Add new scripts:

```json
{
  "test:unit": "vitest run --exclude 'tests/e2e/**'",
  "test:e2e": "vitest run tests/e2e/",
  "test:all": "vitest run"
}
```

`npm test` stays as watch mode for development. `npm run test:all` runs everything in single-run mode (CI-friendly). Remove nothing from existing scripts.

### 5.3 Vitest Config

No changes needed — `tests/e2e/` is already within the `tests/**/*.test.ts` include pattern.

---

## 6. Files Created / Modified

| Action | Path                               | Purpose                                                                                  |
| ------ | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| Create | `tests/e2e/setup.ts`               | pg-mem instance, schema init, `createTestDb()`, DB type generalization                   |
| Create | `tests/e2e/seed.ts`                | Minimal seed data with all notNull fields satisfied                                      |
| Create | `tests/e2e/mocks.ts`               | Fake plugins, handler deps factories, FakePostingStrategy                                |
| Create | `tests/e2e/in-memory-job-queue.ts` | `InMemoryJobQueue` implementing `JobQueue` interface                                     |
| Create | `tests/e2e/pipeline.test.ts`       | Event-driven + scheduled + review + routing E2E tests                                    |
| Create | `tests/e2e/error-handling.test.ts` | LLM fail, visual fail, unknown strategy, retry, reaper, concurrent                       |
| Create | `tests/e2e/api-routes.test.ts`     | Posts API, metrics history, retry, content items                                         |
| Modify | `src/shared/db.ts`                 | Generalize `DB` type to accept pg-mem adapter (approach finalized during implementation) |
| Modify | `package.json`                     | Add `pg-mem`, add test scripts                                                           |

---

## 7. What Stays Manual

| Test Area                             | Why Manual                                          |
| ------------------------------------- | --------------------------------------------------- |
| Shadow mode (Phase 5)                 | Needs real Twitter/Instagram API + private accounts |
| Real metrics collection (Phase 6)     | Needs real posted content + API keys                |
| Dashboard visual UI (Phase 8 partial) | Chart rendering, CSS layout — needs browser         |
| Platform health checks                | Separate sub-project (health dashboard)             |

---

## 8. Success Criteria

- `npm run test:e2e` passes with 0 failures, no external dependencies (no Docker, no API keys, no running Postgres)
- Full pipeline dry-run tested end-to-end: event → content → visual → review → posting
- Error paths verified: graceful failures, no crashes, correct status transitions
- Dashboard API contracts tested with real SQL (not mock chains)
- Total E2E test time < 5 seconds
