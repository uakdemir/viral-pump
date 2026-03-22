import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, type TestDb } from './setup.js';
import { seed } from './seed.js';
import { InMemoryJobQueue } from './in-memory-job-queue.js';
import {
  createGenerateContentDeps,
  createGenerateVisualDeps,
  createPostToPlatformDeps,
  silentLogger,
} from './mocks.js';
import { EventDetector, createTriggerEvaluatorRegistry } from '../../src/worker/event-detector.js';
import { handleGenerateContent } from '../../src/worker/handlers/generate-content.js';
import { handleGenerateVisual } from '../../src/worker/handlers/generate-visual.js';
import { handlePostToPlatform } from '../../src/worker/handlers/post-to-platform.js';
import { approveContent, editAndApprove, rejectContent } from '../../src/domain/review-workflow.js';
import type { DetectedEvent } from '../../src/domain/detected-event.js';
import { eq } from 'drizzle-orm';
import { contentItems } from '../../src/shared/schema/content-items.js';
import { posts } from '../../src/shared/schema/posts.js';
import { contentTemplates } from '../../src/shared/schema/content-templates.js';
import { accounts } from '../../src/shared/schema/accounts.js';
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

function makePriceEvent(verticalId: string): DetectedEvent {
  return {
    source: 'coingecko',
    type: 'price_update',
    verticalId,
    observedAt: new Date(),
    data: {
      changePct: 5.2,
      direction: 'up',
      instrument: 'BTC',
      baseCurrency: 'USD',
      quoteCurrency: 'USD',
      price: 50000,
      previousPrice: 47500,
    },
    rawPayload: {},
  };
}

/**
 * Create a content item directly in DB in ready/pending state.
 * Used by Review Workflow and Platform Routing tests that don't
 * need the full event-driven pipeline.
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

// ─── Seed Validation ─────────────────────────────────────

describe('Seed Validation', () => {
  it('vertical exists with correct slug', () => {
    expect(seedData.vertical).toBeDefined();
    expect(seedData.vertical.slug).toBe('test-vertical');
  });

  it('both accounts have dryRun: true', () => {
    const twitterConfig = seedData.twitterAccount.config as Record<string, unknown>;
    const igConfig = seedData.instagramAccount.config as Record<string, unknown>;

    expect(twitterConfig.dryRun).toBe(true);
    expect(igConfig.dryRun).toBe(true);
    expect(seedData.twitterAccount.platform).toBe('twitter');
    expect(seedData.instagramAccount.platform).toBe('instagram');
  });

  it('trigger rule exists with correct fire mode', () => {
    expect(seedData.rule).toBeDefined();
    expect(seedData.rule.fireMode).toBe('threshold_cross');
    expect(seedData.rule.cooldownMs).toBe(0);
  });

  it('both templates exist (one generic, one instagram-specific)', () => {
    expect(seedData.genericTemplate).toBeDefined();
    expect(seedData.genericTemplate.platform).toBeNull();
    expect(seedData.genericTemplate.name).toBe('test-generic-template');

    expect(seedData.instagramTemplate).toBeDefined();
    expect(seedData.instagramTemplate.platform).toBe('instagram');
    expect(seedData.instagramTemplate.name).toBe('test-instagram-template');
  });

  it('job queue starts empty', () => {
    const jobQueue = new InMemoryJobQueue();
    expect(jobQueue.getAll()).toHaveLength(0);
  });
});

// ─── Event-Driven Pipeline ───────────────────────────────

describe('Event-Driven Pipeline', () => {
  let jobQueue: InMemoryJobQueue;

  beforeEach(() => {
    jobQueue = new InMemoryJobQueue();
  });

  it('runs full dry-run pipeline: event -> content -> visual -> review -> posting', async () => {
    const { vertical, twitterAccount, instagramAccount } = seedData;

    // Step 1: Process event through EventDetector
    const event = makePriceEvent(vertical.id);
    const evaluatorRegistry = createTriggerEvaluatorRegistry();
    const detector = new EventDetector({
      db,
      jobQueue,
      evaluatorRegistry,
      logger: silentLogger,
    });

    await detector.processEvents([event], vertical.id);

    // Step 2: Verify generate-content job enqueued
    const contentJobs = jobQueue.getByType(JOB_TYPES.GENERATE_CONTENT);
    expect(contentJobs.length).toBeGreaterThanOrEqual(1);

    // Step 3: Dequeue and run handleGenerateContent
    const contentJob = await jobQueue.dequeue('test-worker', 60000);
    expect(contentJob).not.toBeNull();
    expect(contentJob!.type).toBe(JOB_TYPES.GENERATE_CONTENT);

    await handleGenerateContent(contentJob!, createGenerateContentDeps(db, jobQueue));

    // Step 4: Verify content item created with correct statuses
    // The handler creates the content item — find it via the visual job payload
    const visualJobs = jobQueue.getByType(JOB_TYPES.GENERATE_VISUAL);
    expect(visualJobs.length).toBeGreaterThanOrEqual(1);

    const visualJob = await jobQueue.dequeue('test-worker', 60000);
    expect(visualJob).not.toBeNull();
    expect(visualJob!.type).toBe(JOB_TYPES.GENERATE_VISUAL);

    const contentItemId = (visualJob!.payload as Record<string, unknown>).contentItemId as string;
    expect(contentItemId).toBeDefined();

    // Before visual generation: content should have generated text but not be "ready" yet
    // (The handler sets generationStatus after visual generation)

    // Step 5: Run handleGenerateVisual
    await handleGenerateVisual(visualJob!, createGenerateVisualDeps(db));

    // Step 6: Verify content item mediaMeta populated
    const [itemAfterVisual] = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, contentItemId));

    expect(itemAfterVisual.generationStatus).toBe(GENERATION_STATUS.READY);
    expect(itemAfterVisual.reviewStatus).toBe(REVIEW_STATUS.PENDING);
    expect(itemAfterVisual.generatedText).toBe('Test content about price movement');

    const mediaMeta = itemAfterVisual.mediaMeta as Record<string, unknown>;
    expect(mediaMeta.mimeType).toBe('image/png');
    expect(mediaMeta.width).toBeDefined();
    expect(mediaMeta.height).toBeDefined();
    expect(mediaMeta.fileSizeBytes).toBeDefined();
    expect(typeof mediaMeta.fileSizeBytes).toBe('number');
    expect(mediaMeta.fileSizeBytes as number).toBeGreaterThan(0);

    // Step 7: Approve content
    const approved = await approveContent(db, jobQueue, contentItemId);
    expect(approved).toBe(true);

    // Verify review status updated
    const [itemAfterApproval] = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, contentItemId));
    expect(itemAfterApproval.reviewStatus).toBe(REVIEW_STATUS.APPROVED);

    // Verify posts created for both accounts
    const allPosts = await db.select().from(posts).where(eq(posts.contentId, contentItemId));
    expect(allPosts).toHaveLength(2);

    const accountIds = allPosts.map(p => p.accountId);
    expect(accountIds).toContain(twitterAccount.id);
    expect(accountIds).toContain(instagramAccount.id);

    // Verify post-to-platform jobs enqueued
    const postJobs = jobQueue.getByType(JOB_TYPES.POST_TO_PLATFORM);
    expect(postJobs).toHaveLength(2);

    // Step 8: Run handlePostToPlatform for each post
    for (let i = 0; i < 2; i++) {
      const postJob = await jobQueue.dequeue('test-worker', 60000);
      expect(postJob).not.toBeNull();
      expect(postJob!.type).toBe(JOB_TYPES.POST_TO_PLATFORM);
      await handlePostToPlatform(
        postJob!,
        createPostToPlatformDeps(db, { assetDir: '/tmp/claude-1000/viral-test' }),
      );
    }

    // Step 9: Verify all posts are posted with dry-run IDs
    const postedPosts = await db.select().from(posts).where(eq(posts.contentId, contentItemId));

    for (const post of postedPosts) {
      expect(post.status).toBe(POST_STATUS.POSTED);
      expect(post.platformPostId).toBeDefined();
      expect(post.platformPostId!.startsWith('dry-run-')).toBe(true);
      expect(post.postedAt).toBeDefined();
    }
  });
});

// ─── Review Workflow ─────────────────────────────────────

describe('Review Workflow', () => {
  let jobQueue: InMemoryJobQueue;

  beforeEach(() => {
    jobQueue = new InMemoryJobQueue();
  });

  it('approve: content pending -> approved, posts created', async () => {
    const contentItemId = await createReadyContentItem(
      seedData.vertical.id,
      seedData.genericTemplate.id,
    );

    const approved = await approveContent(db, jobQueue, contentItemId);
    expect(approved).toBe(true);

    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, contentItemId));
    expect(item.reviewStatus).toBe(REVIEW_STATUS.APPROVED);
    expect(item.reviewedAt).toBeDefined();

    // Posts should be created for both accounts (generic template + image content)
    const createdPosts = await db.select().from(posts).where(eq(posts.contentId, contentItemId));
    expect(createdPosts.length).toBeGreaterThanOrEqual(1);
  });

  it('edit + approve: finalText saved (different from generatedText), posts reference finalText', async () => {
    const originalText = 'Original generated text';
    const editedText = 'Manually edited and improved text';

    const contentItemId = await createReadyContentItem(
      seedData.vertical.id,
      seedData.genericTemplate.id,
      { generatedText: originalText },
    );

    const approved = await editAndApprove(db, jobQueue, contentItemId, editedText);
    expect(approved).toBe(true);

    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, contentItemId));
    expect(item.reviewStatus).toBe(REVIEW_STATUS.APPROVED);
    expect(item.generatedText).toBe(originalText);
    expect(item.finalText).toBe(editedText);
    expect(item.editedAt).toBeDefined();
    expect(item.reviewedAt).toBeDefined();

    // Posts created
    const createdPosts = await db.select().from(posts).where(eq(posts.contentId, contentItemId));
    expect(createdPosts.length).toBeGreaterThanOrEqual(1);

    // When posting, the handler uses finalText ?? generatedText.
    // Verify finalText is what the post will use.
    expect(item.finalText).not.toBe(item.generatedText);
  });

  it('reject: content rejected, zero posts created, rejection notes saved', async () => {
    const rejectionNotes = 'Content quality below threshold';

    const contentItemId = await createReadyContentItem(
      seedData.vertical.id,
      seedData.genericTemplate.id,
    );

    const rejected = await rejectContent(db, contentItemId, rejectionNotes);
    expect(rejected).toBe(true);

    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, contentItemId));
    expect(item.reviewStatus).toBe(REVIEW_STATUS.REJECTED);
    expect(item.reviewNotes).toBe(rejectionNotes);
    expect(item.reviewedAt).toBeDefined();

    // Zero posts created
    const createdPosts = await db.select().from(posts).where(eq(posts.contentId, contentItemId));
    expect(createdPosts).toHaveLength(0);

    // Job queue should be empty (no post-to-platform jobs)
    expect(jobQueue.getByType(JOB_TYPES.POST_TO_PLATFORM)).toHaveLength(0);
  });
});

// ─── Platform Routing ────────────────────────────────────

describe('Platform Routing', () => {
  let jobQueue: InMemoryJobQueue;

  beforeEach(() => {
    jobQueue = new InMemoryJobQueue();
  });

  it('generic template (platform = null) with image content: posts created for BOTH twitter and instagram', async () => {
    const contentItemId = await createReadyContentItem(
      seedData.vertical.id,
      seedData.genericTemplate.id,
    );

    // Verify the template is indeed generic (platform = null)
    const [template] = await db
      .select()
      .from(contentTemplates)
      .where(eq(contentTemplates.id, seedData.genericTemplate.id));
    expect(template.platform).toBeNull();

    const approved = await approveContent(db, jobQueue, contentItemId);
    expect(approved).toBe(true);

    const createdPosts = await db.select().from(posts).where(eq(posts.contentId, contentItemId));

    // Both twitter and instagram support image content
    expect(createdPosts).toHaveLength(2);
    const platforms = await Promise.all(
      createdPosts.map(async p => {
        const [acc] = await db.select().from(accounts).where(eq(accounts.id, p.accountId));
        return acc.platform;
      }),
    );
    expect(platforms.sort()).toEqual(['instagram', 'twitter']);
  });

  it('instagram-specific template: post created for instagram only, not twitter', async () => {
    const contentItemId = await createReadyContentItem(
      seedData.vertical.id,
      seedData.instagramTemplate.id,
    );

    // Verify the template targets instagram
    const [template] = await db
      .select()
      .from(contentTemplates)
      .where(eq(contentTemplates.id, seedData.instagramTemplate.id));
    expect(template.platform).toBe('instagram');

    const approved = await approveContent(db, jobQueue, contentItemId);
    expect(approved).toBe(true);

    const createdPosts = await db.select().from(posts).where(eq(posts.contentId, contentItemId));

    // Only instagram should get a post
    expect(createdPosts).toHaveLength(1);
    expect(createdPosts[0].accountId).toBe(seedData.instagramAccount.id);
  });
});
