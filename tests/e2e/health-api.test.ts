import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { sql, eq, not, inArray } from 'drizzle-orm';
import { createTestDb, type TestDb } from './setup.js';
import { seed } from './seed.js';
import { registerHealthRoutes } from '../../src/web/api/health.js';
import { contentItems } from '../../src/shared/schema/content-items.js';
import { posts } from '../../src/shared/schema/posts.js';
import { jobQueue } from '../../src/shared/schema/job-queue.js';
import { dataSources } from '../../src/shared/schema/data-sources.js';
import { accounts } from '../../src/shared/schema/accounts.js';
import { POST_STATUS } from '../../src/shared/constants.js';
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

beforeEach(async () => {
  // Clean transient tables
  await db.delete(posts);
  await db.delete(contentItems);
  await db.delete(jobQueue);

  // Reset data source lastPolledAt to now
  await db.update(dataSources).set({ lastPolledAt: new Date() });

  // Remove extra accounts (keep only the 2 seed accounts)
  await db
    .delete(accounts)
    .where(not(inArray(accounts.id, [seedData.twitterAccount.id, seedData.instagramAccount.id])));
});

// ─── Helpers ─────────────────────────────────────────────

async function getHealth() {
  const res = await app.inject({
    method: 'GET',
    url: '/api/health/status',
  });
  return res.json();
}

async function insertJob(status: string, updatedAt?: Date) {
  const [job] = await db
    .insert(jobQueue)
    .values({
      type: 'test-job',
      payload: {},
      status,
      updatedAt: updatedAt ?? new Date(),
    })
    .returning();
  return job;
}

async function insertPost(accountId: string, status: string, createdAt?: Date) {
  // Each post needs a content item
  const [ci] = await db
    .insert(contentItems)
    .values({
      verticalId: seedData.vertical.id,
      generatedText: 'Health test content',
    })
    .returning();

  const [post] = await db
    .insert(posts)
    .values({
      contentId: ci.id,
      accountId,
      status,
      createdAt: createdAt ?? new Date(),
    })
    .returning();
  return post;
}

// ─── Job Queue signal ────────────────────────────────────

describe('Job Queue signal', () => {
  it('green when no jobs', async () => {
    const health = await getHealth();
    expect(health.jobQueue.status).toBe('green');
    expect(health.jobQueue.pending).toBe(0);
    expect(health.jobQueue.failedLastHour).toBe(0);
  });

  it('yellow when pending >= 10', async () => {
    for (let i = 0; i < 15; i++) {
      await insertJob('pending');
    }
    const health = await getHealth();
    expect(health.jobQueue.status).toBe('yellow');
    expect(health.jobQueue.pending).toBe(15);
  });

  it('yellow when 1 failed in last hour', async () => {
    await insertJob('failed', new Date());
    const health = await getHealth();
    expect(health.jobQueue.status).toBe('yellow');
    expect(health.jobQueue.failedLastHour).toBe(1);
  });

  it('red when pending >= 51', async () => {
    for (let i = 0; i < 51; i++) {
      await insertJob('pending');
    }
    const health = await getHealth();
    expect(health.jobQueue.status).toBe('red');
    expect(health.jobQueue.pending).toBe(51);
  });

  it('red when >= 6 failed in last hour', async () => {
    for (let i = 0; i < 6; i++) {
      await insertJob('failed', new Date());
    }
    const health = await getHealth();
    expect(health.jobQueue.status).toBe('red');
    expect(health.jobQueue.failedLastHour).toBe(6);
  });
});

// ─── Failure Rate signal ─────────────────────────────────

describe('Failure Rate signal', () => {
  it('green when no attempted posts (total24h = 0)', async () => {
    const health = await getHealth();
    expect(health.failureRate.status).toBe('green');
    expect(health.failureRate.total24h).toBe(0);
    expect(health.failureRate.rate).toBe(0);
  });

  it('green when 0% failure rate', async () => {
    for (let i = 0; i < 20; i++) {
      await insertPost(seedData.twitterAccount.id, POST_STATUS.POSTED);
    }
    const health = await getHealth();
    expect(health.failureRate.status).toBe('green');
    expect(health.failureRate.total24h).toBe(20);
    expect(health.failureRate.failed24h).toBe(0);
    expect(health.failureRate.rate).toBe(0);
  });

  it('yellow when 10% failure rate', async () => {
    // 18 posted + 2 failed = 20 total, 2/20 = 10% (>= 5% yellow threshold)
    for (let i = 0; i < 18; i++) {
      await insertPost(seedData.twitterAccount.id, POST_STATUS.POSTED);
    }
    for (let i = 0; i < 2; i++) {
      await insertPost(seedData.twitterAccount.id, POST_STATUS.FAILED);
    }
    const health = await getHealth();
    expect(health.failureRate.status).toBe('yellow');
    expect(health.failureRate.total24h).toBe(20);
    expect(health.failureRate.failed24h).toBe(2);
    expect(health.failureRate.rate).toBe(0.1);
  });

  it('red when 20% failure rate', async () => {
    // 16 posted + 4 failed = 20 total, 4/20 = 20% (>= 15% red threshold)
    for (let i = 0; i < 16; i++) {
      await insertPost(seedData.twitterAccount.id, POST_STATUS.POSTED);
    }
    for (let i = 0; i < 4; i++) {
      await insertPost(seedData.twitterAccount.id, POST_STATUS.FAILED);
    }
    const health = await getHealth();
    expect(health.failureRate.status).toBe('red');
    expect(health.failureRate.total24h).toBe(20);
    expect(health.failureRate.failed24h).toBe(4);
    expect(health.failureRate.rate).toBe(0.2);
  });

  it('excludes ready and skipped posts from count', async () => {
    // 10 posted, 0 failed, plus some ready/skipped that should be excluded
    for (let i = 0; i < 10; i++) {
      await insertPost(seedData.twitterAccount.id, POST_STATUS.POSTED);
    }
    for (let i = 0; i < 5; i++) {
      await insertPost(seedData.twitterAccount.id, POST_STATUS.READY);
    }
    for (let i = 0; i < 3; i++) {
      await insertPost(seedData.twitterAccount.id, POST_STATUS.SKIPPED);
    }
    const health = await getHealth();
    expect(health.failureRate.status).toBe('green');
    // Only posted + failed count
    expect(health.failureRate.total24h).toBe(10);
    expect(health.failureRate.failed24h).toBe(0);
  });
});

// ─── Data Source Polling signal ──────────────────────────

describe('Data Source Polling signal', () => {
  it('green when sources polled within 2x interval', async () => {
    // beforeEach sets lastPolledAt to now(), so it's fresh
    const health = await getHealth();
    expect(health.dataSources.status).toBe('green');
    expect(health.dataSources.sources).toHaveLength(1);
    expect(health.dataSources.sources[0].status).toBe('green');
  });

  it('yellow when >2x overdue', async () => {
    // pollIntervalMs = 60000, so 180s ago = 3x overdue (> 2x yellow threshold)
    const threeMinutesAgo = new Date(Date.now() - 180_000);
    await db
      .update(dataSources)
      .set({ lastPolledAt: threeMinutesAgo })
      .where(eq(dataSources.id, seedData.dataSource.id));

    const health = await getHealth();
    expect(health.dataSources.status).toBe('yellow');
    expect(health.dataSources.sources[0].status).toBe('yellow');
  });

  it('red when >5x overdue', async () => {
    // pollIntervalMs = 60000, so 360s ago = 6x overdue (> 5x red threshold)
    const sixMinutesAgo = new Date(Date.now() - 360_000);
    await db
      .update(dataSources)
      .set({ lastPolledAt: sixMinutesAgo })
      .where(eq(dataSources.id, seedData.dataSource.id));

    const health = await getHealth();
    expect(health.dataSources.status).toBe('red');
    expect(health.dataSources.sources[0].status).toBe('red');
  });

  it('red when never polled (lastPolledAt is null)', async () => {
    await db
      .update(dataSources)
      .set({ lastPolledAt: null })
      .where(eq(dataSources.id, seedData.dataSource.id));

    const health = await getHealth();
    expect(health.dataSources.status).toBe('red');
    expect(health.dataSources.sources[0].status).toBe('red');
    expect(health.dataSources.sources[0].lastPolledAt).toBeNull();
  });
});

// ─── Account Status signal ───────────────────────────────

describe('Account Status signal', () => {
  it('green when all accounts last post succeeded', async () => {
    await insertPost(seedData.twitterAccount.id, POST_STATUS.POSTED);
    await insertPost(seedData.instagramAccount.id, POST_STATUS.POSTED);

    const health = await getHealth();
    expect(health.accounts.status).toBe('green');
    for (const acct of health.accounts.accounts) {
      expect(acct.status).toBe('green');
    }
  });

  it('green when account has no posts', async () => {
    // No posts inserted — both accounts have no posts
    const health = await getHealth();
    expect(health.accounts.status).toBe('green');
    for (const acct of health.accounts.accounts) {
      expect(acct.lastPostStatus).toBeNull();
    }
  });

  it('yellow when 1 of 3 accounts last post failed', async () => {
    // Add a 3rd account
    const [thirdAccount] = await db
      .insert(accounts)
      .values({
        verticalId: seedData.vertical.id,
        name: 'Test LinkedIn',
        platform: 'linkedin',
        language: 'en',
        market: 'us',
        credentials: {},
        config: { postingStrategy: 'linkedin-api', dryRun: true },
      })
      .returning();

    // 2 succeed, 1 fails => 1/3 < 50% but failedCount >= 1 => yellow
    await insertPost(seedData.twitterAccount.id, POST_STATUS.POSTED);
    await insertPost(seedData.instagramAccount.id, POST_STATUS.POSTED);
    await insertPost(thirdAccount.id, POST_STATUS.FAILED);

    const health = await getHealth();
    expect(health.accounts.status).toBe('yellow');
    expect(health.accounts.accounts).toHaveLength(3);
  });

  it('red when >= 50% of accounts last post failed', async () => {
    // Both seed accounts' last post is failed => 2/2 = 100% >= 50%
    await insertPost(seedData.twitterAccount.id, POST_STATUS.FAILED);
    await insertPost(seedData.instagramAccount.id, POST_STATUS.FAILED);

    const health = await getHealth();
    expect(health.accounts.status).toBe('red');
  });
});

// ─── Overall status ──────────────────────────────────────

describe('Overall status', () => {
  it('equals worst individual signal', async () => {
    // Force data source to red by setting lastPolledAt to null
    await db
      .update(dataSources)
      .set({ lastPolledAt: null })
      .where(eq(dataSources.id, seedData.dataSource.id));

    const health = await getHealth();
    expect(health.dataSources.status).toBe('red');
    expect(health.overall).toBe('red');
  });
});

// ─── Response shape ──────────────────────────────────────

describe('Response shape', () => {
  it('returns all expected fields', async () => {
    const health = await getHealth();

    // Top-level fields
    expect(health).toHaveProperty('jobQueue');
    expect(health).toHaveProperty('failureRate');
    expect(health).toHaveProperty('dataSources');
    expect(health).toHaveProperty('accounts');
    expect(health).toHaveProperty('overall');

    // jobQueue sub-fields
    expect(health.jobQueue).toHaveProperty('status');
    expect(health.jobQueue).toHaveProperty('pending');
    expect(health.jobQueue).toHaveProperty('processing');
    expect(health.jobQueue).toHaveProperty('failedLastHour');

    // failureRate sub-fields
    expect(health.failureRate).toHaveProperty('status');
    expect(health.failureRate).toHaveProperty('total24h');
    expect(health.failureRate).toHaveProperty('failed24h');
    expect(health.failureRate).toHaveProperty('rate');

    // dataSources sub-fields
    expect(health.dataSources).toHaveProperty('status');
    expect(health.dataSources).toHaveProperty('sources');
    expect(Array.isArray(health.dataSources.sources)).toBe(true);
    if (health.dataSources.sources.length > 0) {
      const src = health.dataSources.sources[0];
      expect(src).toHaveProperty('id');
      expect(src).toHaveProperty('provider');
      expect(src).toHaveProperty('status');
      expect(src).toHaveProperty('lastPolledAt');
      expect(src).toHaveProperty('pollIntervalMs');
    }

    // accounts sub-fields
    expect(health.accounts).toHaveProperty('status');
    expect(health.accounts).toHaveProperty('accounts');
    expect(Array.isArray(health.accounts.accounts)).toBe(true);
    if (health.accounts.accounts.length > 0) {
      const acct = health.accounts.accounts[0];
      expect(acct).toHaveProperty('id');
      expect(acct).toHaveProperty('name');
      expect(acct).toHaveProperty('platform');
      expect(acct).toHaveProperty('status');
      expect(acct).toHaveProperty('lastPostStatus');
      expect(acct).toHaveProperty('lastPostAt');
    }
  });
});
