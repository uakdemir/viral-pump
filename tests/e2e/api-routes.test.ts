import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { createTestDb, type TestDb } from './setup.js';
import { seed } from './seed.js';
import { InMemoryJobQueue } from './in-memory-job-queue.js';
import { registerPostsRoutes } from '../../src/web/api/posts.js';
import { registerContentItemsRoutes } from '../../src/web/api/content-items.js';
import { registerMetricsRoutes } from '../../src/web/api/metrics.js';
import { contentItems } from '../../src/shared/schema/content-items.js';
import { posts } from '../../src/shared/schema/posts.js';
import { metricsSnapshots } from '../../src/shared/schema/metrics-snapshots.js';
import { POST_STATUS, GENERATION_STATUS, REVIEW_STATUS } from '../../src/shared/constants.js';
import type { DB } from '../../src/shared/db.js';

let testDb: TestDb;
let db: DB;
let app: FastifyInstance;
let jobQueue: InMemoryJobQueue;
let seedData: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  testDb = createTestDb();
  db = testDb.db;
  seedData = await seed(db);

  jobQueue = new InMemoryJobQueue();

  app = Fastify();
  registerPostsRoutes(app, db, jobQueue);
  registerContentItemsRoutes(app, db, jobQueue);
  registerMetricsRoutes(app, db);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  testDb.close();
});

beforeEach(() => {
  jobQueue.clear();
});

// ─── Helpers ─────────────────────────────────────────────

/** Insert a content item directly in the DB with given statuses. */
async function insertContentItem(opts: {
  verticalId: string;
  templateId?: string;
  generationStatus?: string;
  reviewStatus?: string;
  generatedText?: string;
}) {
  const [item] = await db
    .insert(contentItems)
    .values({
      verticalId: opts.verticalId,
      templateId: opts.templateId ?? null,
      generationStatus: opts.generationStatus ?? GENERATION_STATUS.READY,
      reviewStatus: opts.reviewStatus ?? REVIEW_STATUS.APPROVED,
      generatedText: opts.generatedText ?? 'Test generated text',
    })
    .returning();
  return item;
}

/** Insert a post directly in the DB with given status and metrics. */
async function insertPost(opts: {
  contentId: string;
  accountId: string;
  status: string;
  metrics?: Record<string, number>;
  postedAt?: Date;
  failureReason?: string;
}) {
  const [post] = await db
    .insert(posts)
    .values({
      contentId: opts.contentId,
      accountId: opts.accountId,
      status: opts.status,
      metrics: opts.metrics ?? {},
      postedAt: opts.postedAt ?? null,
      failureReason: opts.failureReason ?? null,
    })
    .returning();
  return post;
}

// ─── 4.1 GET /api/posts ──────────────────────────────────

describe('GET /api/posts', () => {
  let postedPost1: Awaited<ReturnType<typeof insertPost>>;
  let postedPost2: Awaited<ReturnType<typeof insertPost>>;
  let failedPost: Awaited<ReturnType<typeof insertPost>>;

  beforeAll(async () => {
    // Create content items for posts
    const ci1 = await insertContentItem({
      verticalId: seedData.vertical.id,
      templateId: seedData.genericTemplate.id,
    });
    const ci2 = await insertContentItem({
      verticalId: seedData.vertical.id,
      templateId: seedData.genericTemplate.id,
    });
    const ci3 = await insertContentItem({
      verticalId: seedData.vertical.id,
      templateId: seedData.genericTemplate.id,
    });

    // Two posted posts: one twitter, one instagram
    postedPost1 = await insertPost({
      contentId: ci1.id,
      accountId: seedData.twitterAccount.id,
      status: POST_STATUS.POSTED,
      metrics: { views: 100, likes: 10, shares: 5, comments: 2 },
      postedAt: new Date('2026-03-20T12:00:00Z'),
    });

    postedPost2 = await insertPost({
      contentId: ci2.id,
      accountId: seedData.instagramAccount.id,
      status: POST_STATUS.POSTED,
      metrics: { views: 200, likes: 20, shares: 10, comments: 4 },
      postedAt: new Date('2026-03-21T12:00:00Z'),
    });

    // One failed post (twitter)
    failedPost = await insertPost({
      contentId: ci3.id,
      accountId: seedData.twitterAccount.id,
      status: POST_STATUS.FAILED,
      failureReason: 'API rate limit',
    });
  });

  it('returns a bare JSON array for status=posted', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/posts?status=posted',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    // Each item should have the joined fields
    expect(body[0]).toHaveProperty('id');
    expect(body[0]).toHaveProperty('platform');
    expect(body[0]).toHaveProperty('accountName');
  });

  // pg-mem may not support JSONB ->>'key' operator or ::int cast used in the summary SQL.
  // If this test fails due to pg-mem limitations, it should be skipped.
  it.skip('returns { items, summary } when summary=true (skipped: pg-mem lacks JSONB ->> and ::int cast)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/posts?status=posted&summary=true',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('summary');
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.summary).toEqual({
      totalPosts: 2,
      totalViews: 300,
      totalLikes: 30,
      totalShares: 15,
      totalComments: 6,
    });
  });

  it('filters by platform=twitter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/posts?platform=twitter',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    // Should return only twitter posts (postedPost1 + failedPost)
    expect(body.length).toBe(2);
    for (const item of body) {
      expect(item.platform).toBe('twitter');
    }
  });

  it('filters by date range (since/until)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/posts?since=2026-03-21T00:00:00Z&until=2026-03-22T00:00:00Z',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    // Only postedPost2 falls in the March 21 range
    expect(body.length).toBe(1);
    expect(body[0].id).toBe(postedPost2.id);
  });

  it('returns failed posts when status=failed', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/posts?status=failed',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].id).toBe(failedPost.id);
    expect(body[0].failureReason).toBe('API rate limit');
  });
});

// ─── 4.2 GET /api/posts/:id/metrics-history ──────────────

describe('GET /api/posts/:id/metrics-history', () => {
  let postWithSnapshots: Awaited<ReturnType<typeof insertPost>>;
  let postWithoutSnapshots: Awaited<ReturnType<typeof insertPost>>;

  beforeAll(async () => {
    const ci1 = await insertContentItem({
      verticalId: seedData.vertical.id,
    });
    const ci2 = await insertContentItem({
      verticalId: seedData.vertical.id,
    });

    postWithSnapshots = await insertPost({
      contentId: ci1.id,
      accountId: seedData.twitterAccount.id,
      status: POST_STATUS.POSTED,
      metrics: { views: 300, likes: 30 },
      postedAt: new Date('2026-03-18T12:00:00Z'),
    });

    postWithoutSnapshots = await insertPost({
      contentId: ci2.id,
      accountId: seedData.instagramAccount.id,
      status: POST_STATUS.POSTED,
      metrics: { views: 50 },
      postedAt: new Date('2026-03-18T12:00:00Z'),
    });

    // Insert 3 metrics snapshots at different times
    const snapshotTimes = [
      new Date('2026-03-18T13:00:00Z'),
      new Date('2026-03-18T14:00:00Z'),
      new Date('2026-03-18T15:00:00Z'),
    ];
    const snapshotMetrics = [
      { views: 100, likes: 10 },
      { views: 200, likes: 20 },
      { views: 300, likes: 30 },
    ];

    for (let i = 0; i < 3; i++) {
      await db.insert(metricsSnapshots).values({
        postId: postWithSnapshots.id,
        collectedAt: snapshotTimes[i],
        metrics: snapshotMetrics[i],
      });
    }
  });

  it('returns snapshots ordered by collectedAt ascending', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/posts/${postWithSnapshots.id}/metrics-history`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.postId).toBe(postWithSnapshots.id);
    expect(body.snapshots).toHaveLength(3);

    // Verify ascending order
    const timestamps = body.snapshots.map((s: { collectedAt: string }) =>
      new Date(s.collectedAt).getTime(),
    );
    expect(timestamps[0]).toBeLessThan(timestamps[1]);
    expect(timestamps[1]).toBeLessThan(timestamps[2]);

    // Verify metrics values
    expect(body.snapshots[0].metrics).toEqual({ views: 100, likes: 10 });
    expect(body.snapshots[2].metrics).toEqual({ views: 300, likes: 30 });
  });

  it('returns empty snapshots array for post with no snapshots', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/posts/${postWithoutSnapshots.id}/metrics-history`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.postId).toBe(postWithoutSnapshots.id);
    expect(body.snapshots).toEqual([]);
  });
});

// ─── 4.3 POST /api/posts/:id/retry ──────────────────────

describe('POST /api/posts/:id/retry', () => {
  let failedPost: Awaited<ReturnType<typeof insertPost>>;
  let postedPost: Awaited<ReturnType<typeof insertPost>>;

  beforeAll(async () => {
    const ci1 = await insertContentItem({
      verticalId: seedData.vertical.id,
    });
    const ci2 = await insertContentItem({
      verticalId: seedData.vertical.id,
    });

    failedPost = await insertPost({
      contentId: ci1.id,
      accountId: seedData.twitterAccount.id,
      status: POST_STATUS.FAILED,
      failureReason: 'Network timeout',
    });

    postedPost = await insertPost({
      contentId: ci2.id,
      accountId: seedData.instagramAccount.id,
      status: POST_STATUS.POSTED,
      postedAt: new Date(),
    });
  });

  it('returns 404 for non-existent post', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/posts/${randomUUID()}/retry`,
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe('Post not found');
  });

  it('returns 409 for already posted post', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/posts/${postedPost.id}/retry`,
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error).toBe('Only failed posts can be retried');
  });

  it('resets failed post to ready and enqueues job', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/posts/${failedPost.id}/retry`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({ ok: true });

    // Verify the job was enqueued
    const enqueuedJobs = jobQueue.getByType('post-to-platform');
    expect(enqueuedJobs.length).toBe(1);
    expect(enqueuedJobs[0].payload).toEqual({
      postId: failedPost.id,
      contentItemId: failedPost.contentId,
      accountId: failedPost.accountId,
    });

    // Verify post status was reset in the DB
    const [updatedPost] = await db
      .select()
      .from(posts)
      .where(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (await import('drizzle-orm')).eq(posts.id, failedPost.id),
      );
    expect(updatedPost.status).toBe(POST_STATUS.READY);
    expect(updatedPost.failureReason).toBeNull();
  });
});

// ─── 4.4 GET /api/content-items ──────────────────────────

describe('GET /api/content-items', () => {
  let pendingItem: Awaited<ReturnType<typeof insertContentItem>>;
  let approvedItem: Awaited<ReturnType<typeof insertContentItem>>;

  beforeAll(async () => {
    pendingItem = await insertContentItem({
      verticalId: seedData.vertical.id,
      generationStatus: GENERATION_STATUS.READY,
      reviewStatus: REVIEW_STATUS.PENDING,
      generatedText: 'Pending content for test',
    });

    approvedItem = await insertContentItem({
      verticalId: seedData.vertical.id,
      generationStatus: GENERATION_STATUS.READY,
      reviewStatus: REVIEW_STATUS.APPROVED,
      generatedText: 'Approved content for test',
    });
  });

  it('returns pending content items when status=pending', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/content-items?status=pending',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    // At least the pendingItem should be present
    const ids = body.map((item: { id: string }) => item.id);
    expect(ids).toContain(pendingItem.id);
    // The approved item should NOT be in the pending list
    expect(ids).not.toContain(approvedItem.id);
    // All returned items should be pending
    for (const item of body) {
      expect(item.reviewStatus).toBe(REVIEW_STATUS.PENDING);
    }
  });

  it('returns all content items when no status filter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/content-items',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    // Should include both pending and approved items (and possibly others from other tests)
    const ids = body.map((item: { id: string }) => item.id);
    expect(ids).toContain(pendingItem.id);
    expect(ids).toContain(approvedItem.id);
  });
});

// ─── 4.5 POST /api/content-items/:id/approve ────────────

describe('POST /api/content-items/:id/approve', () => {
  it('approves a pending content item and creates posts', async () => {
    // Create a fresh pending item for approval
    const pendingItem = await insertContentItem({
      verticalId: seedData.vertical.id,
      templateId: seedData.genericTemplate.id, // null platform, text-only => compatible with twitter
      generationStatus: GENERATION_STATUS.READY,
      reviewStatus: REVIEW_STATUS.PENDING,
      generatedText: 'Content to approve',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/content-items/${pendingItem.id}/approve`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({ ok: true });

    // Verify content item is now approved
    const { eq } = await import('drizzle-orm');
    const [updated] = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, pendingItem.id));
    expect(updated.reviewStatus).toBe(REVIEW_STATUS.APPROVED);

    // Verify posts were created for compatible accounts
    // The generic template has null platform + no visual_url => text-only
    // Compatible platforms for text-only: twitter, linkedin, telegram, newsletter
    // We have twitter and instagram accounts; only twitter is compatible with text-only
    const createdPosts = await db.select().from(posts).where(eq(posts.contentId, pendingItem.id));
    expect(createdPosts.length).toBeGreaterThanOrEqual(1);

    // Verify job was enqueued
    const postJobs = jobQueue.getByType('post-to-platform');
    expect(postJobs.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 409 when trying to approve non-pending content', async () => {
    // Create an already-approved item
    const approvedItem = await insertContentItem({
      verticalId: seedData.vertical.id,
      generationStatus: GENERATION_STATUS.READY,
      reviewStatus: REVIEW_STATUS.APPROVED,
      generatedText: 'Already approved',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/content-items/${approvedItem.id}/approve`,
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error).toBe('Content is not in pending state');
  });
});
