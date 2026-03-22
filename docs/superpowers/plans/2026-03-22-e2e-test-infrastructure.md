# E2E Test Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automated E2E tests for the dry-run pipeline, error handling, and dashboard API routes using pg-mem — no Docker, no API keys, no running Postgres.

**Architecture:** pg-mem provides an in-memory PostgreSQL instance per test file. An `InMemoryJobQueue` replaces `PostgresJobQueue` (which uses `FOR UPDATE SKIP LOCKED` — incompatible with pg-mem). Fake plugins (content generator, visual generator, asset store, posting strategy) provide deterministic outputs. Three test files cover the pipeline, error handling, and API routes.

**Tech Stack:** Vitest, pg-mem, Drizzle ORM (node-postgres adapter for tests, postgres-js in production), Fastify `inject()`

**Source spec:** `docs/superpowers/specs/2026-03-21-e2e-test-infrastructure-design.md`

---

## File Structure

| Action | Path                               | Responsibility                                         |
| ------ | ---------------------------------- | ------------------------------------------------------ |
| Create | `tests/e2e/setup.ts`               | pg-mem instance, schema init, `createTestDb()`         |
| Create | `tests/e2e/in-memory-job-queue.ts` | `InMemoryJobQueue` implementing `JobQueue` interface   |
| Create | `tests/e2e/seed.ts`                | Minimal seed data for all test files                   |
| Create | `tests/e2e/mocks.ts`               | Fake plugins + handler dependency factories            |
| Create | `tests/e2e/pipeline.test.ts`       | Event-driven + scheduled + review + routing tests      |
| Create | `tests/e2e/error-handling.test.ts` | LLM fail, visual fail, unknown strategy, retry, reaper |
| Create | `tests/e2e/api-routes.test.ts`     | Posts API, metrics history, retry, content items       |
| Modify | `package.json`                     | Add `pg-mem`, add test scripts                         |

---

## Verification Requirements

At the end of **each task**:

- `npx tsc --noEmit` — zero new TypeScript errors
- `npx vitest run` — existing tests still pass

After all tasks:

- `npm run test:e2e` passes with 0 failures
- Total E2E test time < 5 seconds

---

## Task 1: Install pg-mem and add npm scripts

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install pg-mem**

```bash
npm install -D pg-mem
```

- [ ] **Step 2: Add test scripts to package.json**

Add these scripts (keep existing `"test"` and `"test:run"` unchanged):

```json
"test:unit": "vitest run --exclude 'tests/e2e/**'",
"test:e2e": "vitest run tests/e2e/",
"test:all": "vitest run"
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `npx vitest run`
Expected: All 171 tests pass

- [ ] **Step 4: Stage**

```bash
git add package.json package-lock.json
```

Suggested commit: `chore: add pg-mem and e2e test scripts`

---

## Task 2: Create `tests/e2e/setup.ts` — pg-mem database factory

**Files:**

- Create: `tests/e2e/setup.ts`

- [ ] **Step 1: Write the setup module**

```ts
import { newDb } from 'pg-mem';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import * as schema from '../../src/shared/schema/index.js';

/**
 * Creates an in-memory PostgreSQL database using pg-mem.
 *
 * IMPORTANT: The project's production DB uses the `postgres-js` adapter
 * (`drizzle-orm/postgres-js`), but pg-mem only provides a `pg` (node-postgres)
 * compatible adapter. We use `drizzle-orm/node-postgres` here.
 *
 * The returned `db` is `NodePgDatabase<typeof schema>` which differs from
 * the production `PostgresJsDatabase<typeof schema>`. For handler functions
 * and routes that accept `db: DB`, the implementer must verify at implementation
 * time that both types are assignable. If not, change `src/shared/db.ts` to
 * export `type DB = PostgresJsDatabase<typeof schema>` as a union or use a
 * minimal interface that both adapters satisfy (see spec Section 1.1).
 */
export async function createTestDb() {
  const mem = newDb();

  // Register built-in functions pg-mem doesn't include by default
  mem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: { type: 'uuid' },
    implementation: () => crypto.randomUUID(),
  });

  mem.public.registerFunction({
    name: 'uuid_generate_v4',
    returns: { type: 'uuid' },
    implementation: () => crypto.randomUUID(),
  });

  // Get a node-postgres compatible Pool from pg-mem
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();
  const client = await pool.connect();

  // Create tables in dependency order
  await client.query(`
    CREATE TABLE IF NOT EXISTS verticals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      parent_id UUID,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      depth INTEGER NOT NULL DEFAULT 0,
      config JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      vertical_id UUID NOT NULL REFERENCES verticals(id),
      platform TEXT NOT NULL,
      name TEXT NOT NULL,
      language TEXT NOT NULL,
      market TEXT NOT NULL DEFAULT 'global',
      credentials JSONB NOT NULL DEFAULT '{}',
      config JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS data_sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      vertical_id UUID NOT NULL REFERENCES verticals(id),
      provider TEXT NOT NULL,
      config JSONB NOT NULL DEFAULT '{}',
      poll_interval_ms INTEGER NOT NULL DEFAULT 60000,
      status TEXT NOT NULL DEFAULT 'active',
      last_polled_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS trigger_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      vertical_id UUID NOT NULL REFERENCES verticals(id),
      name TEXT NOT NULL,
      condition JSONB NOT NULL,
      fire_mode TEXT NOT NULL DEFAULT 'threshold_cross',
      cooldown_ms INTEGER NOT NULL DEFAULT 3600000,
      lookback_window_ms INTEGER NOT NULL DEFAULT 300000,
      content_config JSONB NOT NULL DEFAULT '{}',
      schedule TEXT,
      next_scheduled_at TIMESTAMPTZ,
      last_predicate_result BOOLEAN,
      last_fired_at TIMESTAMPTZ,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS content_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      vertical_id UUID NOT NULL REFERENCES verticals(id),
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      content_layer TEXT NOT NULL,
      platform TEXT,
      prompt_template TEXT NOT NULL,
      visual_template JSONB NOT NULL DEFAULT '{}',
      platform_meta JSONB NOT NULL DEFAULT '{}',
      generation_config JSONB NOT NULL DEFAULT '{}',
      tags JSONB NOT NULL DEFAULT '[]',
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(vertical_id, name)
    );

    CREATE TABLE IF NOT EXISTS content_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      vertical_id UUID NOT NULL REFERENCES verticals(id),
      template_id UUID REFERENCES content_templates(id),
      event_data JSONB NOT NULL DEFAULT '{}',
      generated_text TEXT,
      visual_url TEXT,
      media_meta JSONB NOT NULL DEFAULT '{}',
      generation_status TEXT NOT NULL DEFAULT 'generating',
      review_status TEXT NOT NULL DEFAULT 'draft',
      final_text TEXT,
      review_notes TEXT,
      edited_at TIMESTAMPTZ,
      tags JSONB NOT NULL DEFAULT '[]',
      ai_config JSONB NOT NULL DEFAULT '{}',
      cost JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      content_id UUID NOT NULL REFERENCES content_items(id),
      account_id UUID NOT NULL REFERENCES accounts(id),
      status TEXT NOT NULL DEFAULT 'ready',
      posted_at TIMESTAMPTZ,
      platform_post_id TEXT,
      url TEXT,
      failure_reason TEXT,
      metrics JSONB NOT NULL DEFAULT '{}',
      cost JSONB NOT NULL DEFAULT '{}',
      last_metrics_collected_at TIMESTAMPTZ,
      metrics_disabled BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(content_id, account_id)
    );

    CREATE TABLE IF NOT EXISTS job_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      locked_by TEXT,
      locked_at TIMESTAMPTZ,
      lease_expires_at TIMESTAMPTZ,
      scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      error JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS metrics_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id UUID NOT NULL REFERENCES posts(id),
      collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metrics JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  client.release();

  // Create Drizzle instance using node-postgres adapter with pg-mem's Pool
  const db = drizzleNodePg(pool, { schema });

  return {
    db,
    close: async () => {
      await pool.end();
    },
  };
}
```

**DB type compatibility note:** The returned `db` is `NodePgDatabase<typeof schema>` while the production code uses `PostgresJsDatabase<typeof schema>`. At implementation time, verify that handler functions accept this type. If they don't, update `src/shared/db.ts` to export a type alias that accepts both adapters (see spec Section 1.1 for the exact approach).

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit`
Expected: PASS (or type errors to resolve — the DB type compatibility is the main risk)

- [ ] **Step 3: Stage**

```bash
git add tests/e2e/setup.ts
```

Suggested commit: `feat(e2e): add pg-mem test database factory`

---

## Task 3: Create `tests/e2e/in-memory-job-queue.ts`

**Files:**

- Create: `tests/e2e/in-memory-job-queue.ts`

- [ ] **Step 1: Write the InMemoryJobQueue**

```ts
import type { Job, JobQueue } from '../../src/plugins/job-queue/types.js';
import { randomUUID } from 'crypto';

interface StoredJob extends Job {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  scheduledAt: Date;
  leaseExpiresAt?: Date;
  lockedBy?: string;
  error?: unknown;
}

export class InMemoryJobQueue implements JobQueue {
  private jobs: StoredJob[] = [];

  async enqueue(
    type: string,
    payload: Record<string, unknown>,
    options?: { scheduledAt?: Date; maxAttempts?: number },
  ): Promise<string> {
    const id = randomUUID();
    this.jobs.push({
      id,
      type,
      payload,
      attempts: 0,
      maxAttempts: options?.maxAttempts ?? 3,
      status: 'pending',
      scheduledAt: options?.scheduledAt ?? new Date(),
    });
    return id;
  }

  async dequeue(workerId: string, leaseDurationMs: number): Promise<Job | null> {
    const now = new Date();
    const job = this.jobs.find(j => j.status === 'pending' && j.scheduledAt <= now);
    if (!job) return null;

    job.status = 'processing';
    job.lockedBy = workerId;
    job.leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
    job.attempts++;

    return {
      id: job.id,
      type: job.type,
      payload: job.payload,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
    };
  }

  async complete(jobId: string): Promise<void> {
    const job = this.jobs.find(j => j.id === jobId);
    if (job) job.status = 'completed';
  }

  async fail(jobId: string, error: unknown): Promise<void> {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job) return;
    job.error = error;
    job.status = job.attempts >= job.maxAttempts ? 'failed' : 'pending';
    job.lockedBy = undefined;
    job.leaseExpiresAt = undefined;
  }

  async extendLease(jobId: string, leaseDurationMs: number): Promise<void> {
    const job = this.jobs.find(j => j.id === jobId);
    if (job) {
      job.leaseExpiresAt = new Date(Date.now() + leaseDurationMs);
    }
  }

  // Test helpers — not part of JobQueue interface
  getAll(): StoredJob[] {
    return [...this.jobs];
  }

  getByType(type: string): StoredJob[] {
    return this.jobs.filter(j => j.type === type);
  }

  getPending(): StoredJob[] {
    return this.jobs.filter(j => j.status === 'pending');
  }

  clear(): void {
    this.jobs = [];
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Stage**

```bash
git add tests/e2e/in-memory-job-queue.ts
```

Suggested commit: `feat(e2e): add InMemoryJobQueue for E2E tests`

---

## Task 4: Create `tests/e2e/seed.ts`

**Files:**

- Create: `tests/e2e/seed.ts`

- [ ] **Step 1: Write the seed function**

```ts
import { eq } from 'drizzle-orm';
import { verticals } from '../../src/shared/schema/verticals.js';
import { accounts } from '../../src/shared/schema/accounts.js';
import { dataSources } from '../../src/shared/schema/data-sources.js';
import { triggerRules } from '../../src/shared/schema/trigger-rules.js';
import { contentTemplates } from '../../src/shared/schema/content-templates.js';
import type { DB } from '../../src/shared/db.js';

export async function seed(db: DB) {
  // 1 vertical
  const [vertical] = await db
    .insert(verticals)
    .values({
      name: 'Test Vertical',
      slug: 'test-vertical',
      config: {
        defaults: {
          triggerEvaluator: 'default',
          contentGenerator: { provider: 'claude', model: 'test-model' },
        },
      },
    })
    .returning();

  // 2 accounts (both dryRun)
  const [twitterAccount] = await db
    .insert(accounts)
    .values({
      verticalId: vertical.id,
      name: 'Test Twitter',
      platform: 'twitter',
      language: 'en',
      market: 'us',
      credentials: {},
      config: { postingStrategy: 'twitter-api', dryRun: true },
    })
    .returning();

  const [instagramAccount] = await db
    .insert(accounts)
    .values({
      verticalId: vertical.id,
      name: 'Test Instagram',
      platform: 'instagram',
      language: 'en',
      market: 'us',
      credentials: {},
      config: { postingStrategy: 'instagram-api', dryRun: true },
    })
    .returning();

  // 1 data source
  const [dataSource] = await db
    .insert(dataSources)
    .values({
      verticalId: vertical.id,
      provider: 'coingecko',
      config: { coinId: 'bitcoin' },
    })
    .returning();

  // 1 trigger rule
  const [rule] = await db
    .insert(triggerRules)
    .values({
      verticalId: vertical.id,
      name: 'Test BTC Rule',
      fireMode: 'threshold_cross',
      condition: {
        match: { source: 'coingecko', type: 'price_update' },
        predicates: [{ field: 'changePct', operator: 'gte', value: 0.001 }],
        logic: 'AND',
      },
      contentConfig: {
        templateNames: ['test-generic-template'],
        templateSelection: 'named',
      },
      cooldownMs: 0, // No cooldown for testing
    })
    .returning();

  // 2 content templates
  const [genericTemplate] = await db
    .insert(contentTemplates)
    .values({
      verticalId: vertical.id,
      name: 'test-generic-template',
      category: 'alert',
      contentLayer: 'text+image',
      platform: null, // Generic — compatible with all platforms
      promptTemplate: 'Write about {{eventData}}',
    })
    .returning();

  const [instagramTemplate] = await db
    .insert(contentTemplates)
    .values({
      verticalId: vertical.id,
      name: 'test-instagram-template',
      category: 'alert',
      contentLayer: 'text+image',
      platform: 'instagram',
      promptTemplate: 'Write an Instagram post about {{eventData}}',
    })
    .returning();

  return {
    vertical,
    twitterAccount,
    instagramAccount,
    dataSource,
    rule,
    genericTemplate,
    instagramTemplate,
  };
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Stage**

```bash
git add tests/e2e/seed.ts
```

Suggested commit: `feat(e2e): add seed data for E2E tests`

---

## Task 5: Create `tests/e2e/mocks.ts` — fake plugins and dependency factories

**Files:**

- Create: `tests/e2e/mocks.ts`

- [ ] **Step 1: Write the mocks**

```ts
import type {
  ContentGenerator,
  ContentGeneratorInput,
  ContentGeneratorOutput,
} from '../../src/plugins/content-generators/types.js';
import type {
  VisualGenerator,
  VisualGeneratorInput,
} from '../../src/plugins/visual-generators/types.js';
import type { AssetStore } from '../../src/plugins/asset-store/types.js';
import type {
  PostingStrategy,
  PostInput,
  PostResult,
} from '../../src/plugins/posting-strategies/types.js';
import type { JobQueue } from '../../src/plugins/job-queue/types.js';
import type { DB } from '../../src/shared/db.js';
import { createRegistry } from '../../src/plugins/registry.js';
import { randomUUID } from 'crypto';

// ── Fake Content Generator ──────────────────────────

export class FakeContentGenerator implements ContentGenerator {
  private shouldFail: boolean;

  constructor(opts: { shouldFail?: boolean } = {}) {
    this.shouldFail = opts.shouldFail ?? false;
  }

  async generate(_input: ContentGeneratorInput): Promise<ContentGeneratorOutput> {
    if (this.shouldFail) {
      throw new Error('FakeContentGenerator: simulated LLM failure');
    }
    return {
      text: 'Test content about price movement',
      tags: ['test', 'automated'],
      tokensUsed: 42,
      model: 'fake-model',
      durationMs: 10,
    };
  }
}

// ── Fake Visual Generator ──────────────────────────

export class FakeVisualGenerator implements VisualGenerator {
  private shouldFail: boolean;

  constructor(opts: { shouldFail?: boolean } = {}) {
    this.shouldFail = opts.shouldFail ?? false;
  }

  async generate(_input: VisualGeneratorInput): Promise<Buffer> {
    if (this.shouldFail) {
      throw new Error('FakeVisualGenerator: simulated visual generation failure');
    }
    // Return a minimal valid PNG (1x1 pixel)
    return Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
  }
}

// ── Fake Asset Store ──────────────────────────

export class FakeAssetStore implements AssetStore {
  async store(id: string, _buffer: Buffer, extension: string): Promise<string> {
    return `/fake-assets/${id}.${extension}`;
  }

  resolve(url: string): string {
    return `/tmp/fake-resolve${url}`;
  }

  getPublicUrl(url: string): string {
    return `http://localhost:3001/assets${url}`;
  }
}

// ── Fake Posting Strategy ──────────────────────────

export class FakePostingStrategy implements PostingStrategy {
  validateInput(_input: PostInput): void {
    // Always passes
  }

  async post(_input: PostInput): Promise<PostResult> {
    return {
      platformPostId: `fake-post-${randomUUID().slice(0, 8)}`,
      postedAt: new Date(),
      url: 'https://fake-platform.test/post/123',
    };
  }
}

// ── Silent Logger ──────────────────────────

export const silentLogger = {
  info: (..._args: unknown[]) => {},
  warn: (..._args: unknown[]) => {},
  error: (..._args: unknown[]) => {},
  debug: (..._args: unknown[]) => {},
};

// ── Handler Dependency Factories ──────────────────────────

export function createGenerateContentDeps(
  db: DB,
  jobQueue: JobQueue,
  overrides?: { failGenerator?: boolean },
) {
  const contentGeneratorRegistry = createRegistry<ContentGenerator>();
  contentGeneratorRegistry.register(
    'claude',
    () => new FakeContentGenerator({ shouldFail: overrides?.failGenerator }),
  );
  contentGeneratorRegistry.register(
    'openai',
    () => new FakeContentGenerator({ shouldFail: overrides?.failGenerator }),
  );

  return {
    db,
    jobQueue,
    contentGeneratorRegistry,
    logger: silentLogger,
  };
}

export function createGenerateVisualDeps(db: DB, overrides?: { failGenerator?: boolean }) {
  return {
    db,
    visualGenerator: new FakeVisualGenerator({ shouldFail: overrides?.failGenerator }),
    assetStore: new FakeAssetStore(),
    logger: silentLogger,
  };
}

export function createPostToPlatformDeps(db: DB, overrides?: { assetDir?: string }) {
  const postingStrategyRegistry = createRegistry<PostingStrategy>();
  postingStrategyRegistry.register('twitter-api', () => new FakePostingStrategy());
  postingStrategyRegistry.register('instagram-api', () => new FakePostingStrategy());
  postingStrategyRegistry.register('dry-run', cfg => {
    // Use the real DryRunPostingStrategy for dry-run tests
    // Import dynamically to avoid pulling in fs dependencies at module level
    const { DryRunPostingStrategy } = require('../../src/plugins/posting-strategies/dry-run.js');
    return new DryRunPostingStrategy({ outputDir: cfg.outputDir ?? '/tmp/viral-test/dry-run' });
  });

  return {
    db,
    postingStrategyRegistry,
    appCredentials: { apiKey: 'test-key', apiSecret: 'test-secret' },
    assetStore: new FakeAssetStore(),
    assetDir: overrides?.assetDir ?? '/tmp/viral-test',
    logger: silentLogger,
  };
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Stage**

```bash
git add tests/e2e/mocks.ts
```

Suggested commit: `feat(e2e): add fake plugins and handler dependency factories`

---

## Task 6: Write `tests/e2e/pipeline.test.ts`

**Files:**

- Create: `tests/e2e/pipeline.test.ts`

This is the largest test file. It covers:

- Seed validation (Section 2.1 of spec)
- Event-driven pipeline (Section 2.2)
- Review workflow (Section 2.4)
- Platform routing (Section 2.5)

- [ ] **Step 1: Write the test file**

The test file must:

1. Create a fresh pg-mem DB via `createTestDb()` in `beforeAll`
2. Seed via `seed(db)` in `beforeAll`
3. Create an `InMemoryJobQueue` in `beforeEach`
4. Test the full pipeline: event → content → visual → review → posting
5. Clean up tmp files in `afterAll`

Read the spec Section 2.1-2.5 for the exact test scenarios and assertions. The test structure should follow:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb } from './setup.js';
import { seed } from './seed.js';
import { InMemoryJobQueue } from './in-memory-job-queue.js';
import {
  createGenerateContentDeps,
  createGenerateVisualDeps,
  createPostToPlatformDeps,
  silentLogger,
} from './mocks.js';
import { EventDetector } from '../../src/worker/event-detector.js';
import { handleGenerateContent } from '../../src/worker/handlers/generate-content.js';
import { handleGenerateVisual } from '../../src/worker/handlers/generate-visual.js';
import { handlePostToPlatform } from '../../src/worker/handlers/post-to-platform.js';
import { approveContent, editAndApprove, rejectContent } from '../../src/domain/review-workflow.js';
import { createRegistry } from '../../src/plugins/registry.js';
import { DefaultTriggerEvaluator } from '../../src/domain/trigger-evaluator.js';
import type { DetectedEvent } from '../../src/domain/detected-event.js';
import { eq } from 'drizzle-orm';
import { contentItems } from '../../src/shared/schema/content-items.js';
import { posts } from '../../src/shared/schema/posts.js';
import {
  JOB_TYPES,
  GENERATION_STATUS,
  REVIEW_STATUS,
  POST_STATUS,
} from '../../src/shared/constants.js';
// ... additional imports as needed
```

Key test scenarios from the spec:

**Seed validation:** Verify vertical exists, both accounts have dryRun, rule exists, both templates exist.

**Event-driven pipeline:**

1. Create DetectedEvent, call `EventDetector.processEvents()`, verify generate-content job enqueued
2. Dequeue, run `handleGenerateContent`, verify content item created with `generationStatus='ready'`, generate-visual job enqueued
3. Dequeue, run `handleGenerateVisual`, verify mediaMeta populated
4. Call `approveContent()`, verify posts created for both accounts, post-to-platform jobs enqueued
5. Dequeue and run `handlePostToPlatform` for each, verify posts `status='posted'` with `dry-run-*` platformPostId

**Review workflow:** Approve, edit+approve, reject — test each status transition.

**Scheduled pipeline (Section 2.3):** Seed a scheduled trigger rule with `next_scheduled_at` in the past and `fire_mode: 'scheduled'`. Directly create a `DetectedEvent` with `source: 'scheduled'`, call `EventDetector.processEvents()`. Verify generate-content job enqueued. Run through content → approval → posting. Manually advance `next_scheduled_at` and verify it's in the future.

**Platform routing:** Generic template → posts for both accounts. Instagram-specific template → post for Instagram only.

Implement the full test scenarios per the spec. Each `describe` block should match a spec section.

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/e2e/pipeline.test.ts`
Expected: All PASS (this will likely require debugging the pg-mem setup — adapt `createTestDb` as needed)

- [ ] **Step 3: Stage**

```bash
git add tests/e2e/pipeline.test.ts
```

Suggested commit: `feat(e2e): add pipeline E2E tests — event, content, visual, review, posting`

---

## Task 7: Write `tests/e2e/error-handling.test.ts`

**Files:**

- Create: `tests/e2e/error-handling.test.ts`

Covers spec Sections 3.1-3.6:

**3.1 LLM Generation Failure:** Use `createGenerateContentDeps(db, jobQueue, { failGenerator: true })`, run handler, verify `generationStatus='failed'`, no generate-visual job.

**3.2 Visual Generation Failure:** Use `createGenerateVisualDeps(db, { failGenerator: true })`, run handler, verify `generationStatus='failed'`.

**3.3 Unknown Posting Strategy:** Set account `config.postingStrategy='nonexistent-api'`, approve content, run handler, verify post `status='failed'`, `failureReason` contains "Unknown posting strategy", job NOT re-enqueued.

**3.4 Retry Flow:** From failed post, call POST /api/posts/:id/retry, verify post reset to `status='ready'`, new job enqueued. Fix account strategy, run job, verify `status='posted'`.

**3.5 Job Reaper:** Insert a job with `status='processing'` and `lease_expires_at` 10 min in the past, run reaper, verify job reset to `status='pending'`.

**3.6 Concurrent Safety:** Attempt to insert two posts with same `(contentId, accountId)`, verify unique constraint violation.

- [ ] **Step 1: Write the test file**

Follow the same pattern as pipeline.test.ts — `createTestDb()` in `beforeAll`, seed, `InMemoryJobQueue` in `beforeEach`.

For Section 3.4 (retry), you'll need to test the API route — use Fastify `inject()` similar to api-routes.test.ts.

For Section 3.5 (reaper), `JobReaper.reap()` is a `private` method. Either (a) change it to `public` in `src/worker/job-reaper.ts` (recommended — small source change, add `public` keyword), or (b) test by directly running the same raw SQL the reaper uses against pg-mem's `job_queue` table: `UPDATE job_queue SET status = 'pending', locked_by = NULL, lease_expires_at = NULL WHERE status = 'processing' AND lease_expires_at < NOW()`.

For Section 3.6 (concurrent safety), use Drizzle's `.insert()` with `.onConflictDoNothing()` or catch the constraint violation.

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/e2e/error-handling.test.ts`
Expected: All PASS

- [ ] **Step 3: Stage**

```bash
git add tests/e2e/error-handling.test.ts
```

Suggested commit: `feat(e2e): add error handling E2E tests — failures, retry, reaper, concurrency`

---

## Task 8: Write `tests/e2e/api-routes.test.ts`

**Files:**

- Create: `tests/e2e/api-routes.test.ts`

Covers spec Sections 4.1-4.5. Uses Fastify's `inject()` method against a real Fastify instance with routes registered against the pg-mem DB.

**Setup pattern:**

```ts
import Fastify from 'fastify';
import { registerPostsRoutes } from '../../src/web/api/posts.js';
import { registerContentItemsRoutes } from '../../src/web/api/content-items.js';
import { registerMetricsRoutes } from '../../src/web/api/metrics.js';

let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  const { db } = await createTestDb();
  const jobQueue = new InMemoryJobQueue();
  const seedData = await seed(db);

  app = Fastify({ logger: false });
  registerPostsRoutes(app, db, jobQueue);
  registerContentItemsRoutes(app, db, jobQueue);
  registerMetricsRoutes(app, db);
  await app.ready();
});
```

**Test scenarios from spec:**

**4.1 GET /api/posts:** Bare array response, summary response with totals, platform filter, vertical filter, date filter.

**4.2 GET /api/posts/:id/metrics-history:** Seed 3 snapshots, verify ordered by `collectedAt` ascending. Empty case returns `{ postId, snapshots: [] }`.

**4.3 POST /api/posts/:id/retry:** 404 for non-existent, 409 for non-failed post, 200 for failed post (resets to ready, enqueues job).

**4.4 GET /api/content-items:** Seed pending + approved items, filter by `?status=pending`.

**4.5 POST /api/content-items/:id/approve:** Approve pending item, verify `reviewStatus='approved'`, posts created.

Note: The posts summary route uses raw SQL with `COALESCE`, `SUM`, `(metrics->>'views')::int`. pg-mem needs to support these — register the `->>'key'` operator and `::int` cast if pg-mem rejects them. See spec Section 1.5.

- [ ] **Step 1: Write the test file**

Implement all scenarios per the spec. Seed enough data for the filter tests (posted + failed posts, multiple platforms).

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/e2e/api-routes.test.ts`
Expected: All PASS

- [ ] **Step 3: Stage**

```bash
git add tests/e2e/api-routes.test.ts
```

Suggested commit: `feat(e2e): add API route E2E tests — posts, metrics, retry, content items`

---

## Task 9: Full E2E verification and final cleanup

- [ ] **Step 1: Run all E2E tests**

Run: `npm run test:e2e`
Expected: All PASS

- [ ] **Step 2: Verify test time**

Expected: Total E2E test time < 5 seconds

- [ ] **Step 3: Run full test suite (unit + e2e)**

Run: `npm run test:all`
Expected: All tests pass (existing 171 + new E2E tests)

- [ ] **Step 4: Verify unit tests still isolated**

Run: `npm run test:unit`
Expected: Only unit tests run (excludes tests/e2e/\*)

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Stage all**

```bash
git add tests/e2e/ package.json package-lock.json
```

Suggested commit: `feat: complete E2E test infrastructure — pg-mem, pipeline, errors, API routes`
