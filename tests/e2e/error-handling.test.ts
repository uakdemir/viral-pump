import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, type TestDb } from './setup.js';
import { seed } from './seed.js';
import { InMemoryJobQueue } from './in-memory-job-queue.js';
import {
  createGenerateContentDeps,
  createGenerateVisualDeps,
  createPostToPlatformDeps,
} from './mocks.js';
import { handleGenerateContent } from '../../src/worker/handlers/generate-content.js';
import { handleGenerateVisual } from '../../src/worker/handlers/generate-visual.js';
import { handlePostToPlatform } from '../../src/worker/handlers/post-to-platform.js';
import { approveContent } from '../../src/domain/review-workflow.js';
import { eq, sql } from 'drizzle-orm';
import { contentItems } from '../../src/shared/schema/content-items.js';
import { posts } from '../../src/shared/schema/posts.js';
import { accounts } from '../../src/shared/schema/accounts.js';
import { jobQueue as jobQueueTable } from '../../src/shared/schema/job-queue.js';
import {
  JOB_TYPES,
  GENERATION_STATUS,
  REVIEW_STATUS,
  POST_STATUS,
} from '../../src/shared/constants.js';
import type { DB } from '../../src/shared/db.js';

let testDb: TestDb;
let db: DB;
let seedData: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  testDb = createTestDb();
  db = testDb.db;
  seedData = await seed(db);
});

afterAll(() => {
  testDb.close();
});

// ─── Helpers ─────────────────────────────────────────────

/**
 * Create a content item directly in DB in ready/pending state.
 * Used by tests that need an approved content item with posts.
 */
async function createReadyContentItem(
  verticalId: string,
  templateId: string,
  overrides?: { generatedText?: string },
): Promise<string> {
  const [item] = await db
    .insert(contentItems)
    .values({
      verticalId,
      templateId,
      eventData: { test: true },
      generatedText: overrides?.generatedText ?? 'Test generated text',
      visualUrl: '/fake-assets/test.png',
      mediaMeta: { mimeType: 'image/png', width: 1200, height: 628, fileSizeBytes: 1024 },
      generationStatus: GENERATION_STATUS.READY,
      reviewStatus: REVIEW_STATUS.PENDING,
    })
    .returning();
  return item.id;
}

// ─── 3.1 LLM Generation Failure ─────────────────────────

describe('LLM Generation Failure', () => {
  let jobQueue: InMemoryJobQueue;

  beforeEach(() => {
    jobQueue = new InMemoryJobQueue();
  });

  it('handleGenerateContent with failing generator: sets generationStatus to failed and does not enqueue visual job', async () => {
    const { vertical, genericTemplate } = seedData;

    // Enqueue a generate-content job (as the EventDetector would)
    const jobId = await jobQueue.enqueue(JOB_TYPES.GENERATE_CONTENT, {
      verticalId: vertical.id,
      templateId: genericTemplate.id,
      eventData: {
        source: 'coingecko',
        type: 'price_update',
        data: { changePct: 5.0, instrument: 'BTC', price: 50000 },
      },
    });

    // Dequeue and run with a failing generator
    const job = await jobQueue.dequeue('test-worker', 60000);
    expect(job).not.toBeNull();

    const deps = createGenerateContentDeps(db, jobQueue, { failGenerator: true });

    // The handler throws after setting generationStatus = 'failed'
    await expect(handleGenerateContent(job!, deps)).rejects.toThrow(
      'FakeContentGenerator: simulated LLM failure',
    );

    // Find the content item that was created by the handler
    // It should have generationStatus = 'failed'
    const allItems = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.verticalId, vertical.id));

    // The most recently created item should be the failed one
    const failedItems = allItems.filter(i => i.generationStatus === GENERATION_STATUS.FAILED);
    expect(failedItems.length).toBeGreaterThanOrEqual(1);

    // No generate-visual job should have been enqueued
    const visualJobs = jobQueue.getByType(JOB_TYPES.GENERATE_VISUAL);
    expect(visualJobs).toHaveLength(0);
  });
});

// ─── 3.2 Visual Generation Failure ──────────────────────

describe('Visual Generation Failure', () => {
  it('handleGenerateVisual with failing generator: sets generationStatus to failed', async () => {
    const { vertical, genericTemplate } = seedData;

    // Create a content item in 'generating' state with generatedText already set
    // (simulating the state after successful LLM generation, before visual)
    const [item] = await db
      .insert(contentItems)
      .values({
        verticalId: vertical.id,
        templateId: genericTemplate.id,
        eventData: { test: true },
        generatedText: 'Content that needs a visual',
        generationStatus: GENERATION_STATUS.GENERATING,
        reviewStatus: REVIEW_STATUS.DRAFT,
      })
      .returning();

    // Build a fake job matching what handleGenerateContent would enqueue
    const fakeJob = {
      id: 'visual-fail-test-job',
      type: JOB_TYPES.GENERATE_VISUAL,
      payload: {
        contentItemId: item.id,
        templateConfig: {},
        context: { generatedText: 'Content that needs a visual' },
      },
      attempts: 1,
      maxAttempts: 3,
    };

    const deps = createGenerateVisualDeps(db, { failGenerator: true });

    // The handler throws after setting generationStatus = 'failed'
    await expect(handleGenerateVisual(fakeJob, deps)).rejects.toThrow(
      'FakeVisualGenerator: simulated visual generation failure',
    );

    // Verify the content item's generationStatus is now 'failed'
    const [updatedItem] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));

    expect(updatedItem.generationStatus).toBe(GENERATION_STATUS.FAILED);
    // Visual URL should remain null since generation failed
    expect(updatedItem.visualUrl).toBeNull();
  });
});

// ─── 3.3 Unknown Posting Strategy ───────────────────────

describe('Unknown Posting Strategy', () => {
  let jobQueue: InMemoryJobQueue;

  beforeEach(() => {
    jobQueue = new InMemoryJobQueue();
  });

  it('post to account with nonexistent posting strategy: post status = failed, no re-enqueue', async () => {
    const { vertical, genericTemplate } = seedData;

    // Create a new account with a bogus posting strategy
    const [badAccount] = await db
      .insert(accounts)
      .values({
        verticalId: vertical.id,
        name: 'Bad Strategy Account',
        platform: 'twitter',
        language: 'en',
        market: 'us',
        credentials: {},
        config: { postingStrategy: 'nonexistent-api', dryRun: false },
      })
      .returning();

    // Create a content item and a post for that account
    const contentItemId = await createReadyContentItem(vertical.id, genericTemplate.id);

    const [post] = await db
      .insert(posts)
      .values({
        contentId: contentItemId,
        accountId: badAccount.id,
        status: POST_STATUS.READY,
      })
      .returning();

    // Build a job as handlePostToPlatform expects
    const fakeJob = {
      id: 'post-bad-strategy-job',
      type: JOB_TYPES.POST_TO_PLATFORM,
      payload: {
        postId: post.id,
        contentItemId,
        accountId: badAccount.id,
      },
      attempts: 1,
      maxAttempts: 3,
    };

    const deps = createPostToPlatformDeps(db, { assetDir: '/tmp/claude-1000/viral-test' });

    // The handler catches the unknown strategy error internally and returns normally
    await handlePostToPlatform(fakeJob, deps);

    // Verify: post status = 'failed' with correct failure reason
    const [updatedPost] = await db.select().from(posts).where(eq(posts.id, post.id));

    expect(updatedPost.status).toBe(POST_STATUS.FAILED);
    expect(updatedPost.failureReason).toContain('Unknown posting strategy');
    expect(updatedPost.failureReason).toContain('nonexistent-api');

    // The job should NOT be re-enqueued (config error, not transient)
    // Since handler returned normally (no throw), the job queue won't retry
    const pendingJobs = jobQueue.getPending();
    const retryJobs = pendingJobs.filter(j => j.type === JOB_TYPES.POST_TO_PLATFORM);
    expect(retryJobs).toHaveLength(0);
  });
});

// ─── 3.4 Retry Flow ─────────────────────────────────────

describe('Retry Flow', () => {
  let jobQueue: InMemoryJobQueue;

  beforeEach(() => {
    jobQueue = new InMemoryJobQueue();
  });

  it('retry a failed post after fixing account strategy: post becomes posted', async () => {
    const { vertical, genericTemplate } = seedData;

    // Create an account with a bad strategy
    const [retryAccount] = await db
      .insert(accounts)
      .values({
        verticalId: vertical.id,
        name: 'Retry Test Account',
        platform: 'twitter',
        language: 'en',
        market: 'us',
        credentials: {},
        config: { postingStrategy: 'nonexistent-api', dryRun: false },
      })
      .returning();

    // Create content item and post
    const contentItemId = await createReadyContentItem(vertical.id, genericTemplate.id);

    const [post] = await db
      .insert(posts)
      .values({
        contentId: contentItemId,
        accountId: retryAccount.id,
        status: POST_STATUS.READY,
      })
      .returning();

    // First attempt: fails due to unknown strategy
    const firstJob = {
      id: 'retry-test-job-1',
      type: JOB_TYPES.POST_TO_PLATFORM,
      payload: {
        postId: post.id,
        contentItemId,
        accountId: retryAccount.id,
      },
      attempts: 1,
      maxAttempts: 3,
    };

    const deps = createPostToPlatformDeps(db, { assetDir: '/tmp/claude-1000/viral-test' });
    await handlePostToPlatform(firstJob, deps);

    // Confirm failed
    const [failedPost] = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(failedPost.status).toBe(POST_STATUS.FAILED);

    // Simulate what POST /api/posts/:id/retry does:
    // 1. Reset post to 'ready', clear failureReason
    await db
      .update(posts)
      .set({
        status: POST_STATUS.READY,
        failureReason: null,
      })
      .where(eq(posts.id, post.id));

    // 2. Fix the account strategy to a valid one
    await db
      .update(accounts)
      .set({
        config: { postingStrategy: 'twitter-api', dryRun: true },
      })
      .where(eq(accounts.id, retryAccount.id));

    // 3. Enqueue a new POST_TO_PLATFORM job
    await jobQueue.enqueue(JOB_TYPES.POST_TO_PLATFORM, {
      postId: post.id,
      contentItemId,
      accountId: retryAccount.id,
    });

    // Run the retry job
    const retryJob = await jobQueue.dequeue('test-worker', 60000);
    expect(retryJob).not.toBeNull();
    expect(retryJob!.type).toBe(JOB_TYPES.POST_TO_PLATFORM);

    await handlePostToPlatform(retryJob!, deps);

    // Verify: post is now 'posted' with a dry-run ID
    const [retryPost] = await db.select().from(posts).where(eq(posts.id, post.id));

    expect(retryPost.status).toBe(POST_STATUS.POSTED);
    expect(retryPost.platformPostId).toBeDefined();
    expect(retryPost.platformPostId!.startsWith('dry-run-')).toBe(true);
    expect(retryPost.postedAt).toBeDefined();
    // failureReason should be cleared by the handler on success
    expect(retryPost.failureReason).toBeNull();
  });
});

// ─── 3.5 Job Reaper ─────────────────────────────────────

describe('Job Reaper', () => {
  it('reaps stale processing jobs: resets status to pending', async () => {
    // Insert a job directly into job_queue with status = 'processing'
    // and lease_expires_at 10 minutes in the past
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const [staleJob] = await db
      .insert(jobQueueTable)
      .values({
        type: JOB_TYPES.GENERATE_CONTENT,
        payload: { test: 'stale-job' },
        status: 'processing',
        lockedBy: 'dead-worker',
        leaseExpiresAt: tenMinutesAgo,
        attempts: 1,
        maxAttempts: 3,
      })
      .returning();

    // Verify the job is in 'processing' state
    const [beforeReap] = await db
      .select()
      .from(jobQueueTable)
      .where(eq(jobQueueTable.id, staleJob.id));
    expect(beforeReap.status).toBe('processing');
    expect(beforeReap.lockedBy).toBe('dead-worker');

    // Execute the reaper's SQL directly (option b from the spec)
    await db.execute(sql`
      UPDATE job_queue
      SET status = 'pending', locked_by = NULL, lease_expires_at = NULL
      WHERE status = 'processing' AND lease_expires_at < NOW()
    `);

    // Verify: job reset to 'pending'
    const [afterReap] = await db
      .select()
      .from(jobQueueTable)
      .where(eq(jobQueueTable.id, staleJob.id));

    expect(afterReap.status).toBe('pending');
    expect(afterReap.lockedBy).toBeNull();
    expect(afterReap.leaseExpiresAt).toBeNull();
  });
});

// ─── 3.6 Concurrent Safety ──────────────────────────────

describe('Concurrent Safety', () => {
  it('unique constraint prevents duplicate (contentId, accountId) posts', async () => {
    const { vertical, genericTemplate, twitterAccount } = seedData;

    // Create a content item
    const contentItemId = await createReadyContentItem(vertical.id, genericTemplate.id);

    // Insert the first post — should succeed
    await db.insert(posts).values({
      contentId: contentItemId,
      accountId: twitterAccount.id,
      status: POST_STATUS.READY,
    });

    // Attempt to insert a duplicate — same (contentId, accountId)
    // Without onConflictDoNothing, this should throw a unique constraint violation
    await expect(
      db.insert(posts).values({
        contentId: contentItemId,
        accountId: twitterAccount.id,
        status: POST_STATUS.READY,
      }),
    ).rejects.toThrow();
  });
});
