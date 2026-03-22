import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createTestDb, type TestDb } from './setup.js';
import {
  verticals,
  accounts,
  dataSources,
  triggerRules,
  contentTemplates,
  contentItems,
  posts,
  jobQueue,
  metricsSnapshots,
} from '../../src/shared/schema/index.js';
import { eq } from 'drizzle-orm';

describe('createTestDb', () => {
  let testDb: TestDb;

  beforeAll(() => {
    testDb = createTestDb();
  });

  afterAll(() => {
    testDb.close();
  });

  it('should insert and query a vertical', async () => {
    const db = testDb.rawDb;

    const [inserted] = await db
      .insert(verticals)
      .values({
        name: 'Crypto',
        slug: 'crypto',
        depth: 0,
        config: { theme: 'dark' },
        status: 'active',
      })
      .returning();

    expect(inserted.id).toBeDefined();
    expect(inserted.name).toBe('Crypto');
    expect(inserted.slug).toBe('crypto');
    expect(inserted.config).toEqual({ theme: 'dark' });
    expect(inserted.createdAt).toBeInstanceOf(Date);

    const [queried] = await db.select().from(verticals).where(eq(verticals.slug, 'crypto'));

    expect(queried.id).toBe(inserted.id);
    expect(queried.name).toBe('Crypto');
  });

  it('should insert and query an account with FK to verticals', async () => {
    const db = testDb.rawDb;

    const [vertical] = await db.select().from(verticals).where(eq(verticals.slug, 'crypto'));

    const [account] = await db
      .insert(accounts)
      .values({
        verticalId: vertical.id,
        platform: 'twitter',
        name: 'CryptoBot',
        language: 'en',
        market: 'global',
        credentials: { token: 'test' },
        config: {},
        status: 'active',
      })
      .returning();

    expect(account.id).toBeDefined();
    expect(account.verticalId).toBe(vertical.id);
    expect(account.platform).toBe('twitter');
  });

  it('should create content pipeline entities (template -> item -> post)', async () => {
    const db = testDb.rawDb;

    const [vertical] = await db.select().from(verticals).where(eq(verticals.slug, 'crypto'));

    const [template] = await db
      .insert(contentTemplates)
      .values({
        verticalId: vertical.id,
        name: 'Price Alert',
        category: 'alert',
        contentLayer: 'text',
        promptTemplate: 'Price of {{coin}} is {{price}}',
        visualTemplate: {},
        platformMeta: {},
        generationConfig: {},
        tags: ['crypto', 'alert'],
        enabled: true,
      })
      .returning();

    expect(template.id).toBeDefined();
    expect(template.name).toBe('Price Alert');

    const [item] = await db
      .insert(contentItems)
      .values({
        verticalId: vertical.id,
        templateId: template.id,
        eventData: { coin: 'BTC', price: 50000 },
        generatedText: 'BTC is now $50,000!',
        generationStatus: 'ready',
        reviewStatus: 'approved',
        finalText: 'BTC is now $50,000!',
      })
      .returning();

    expect(item.id).toBeDefined();
    expect(item.templateId).toBe(template.id);

    const [account] = await db.select().from(accounts).where(eq(accounts.platform, 'twitter'));

    const [post] = await db
      .insert(posts)
      .values({
        contentId: item.id,
        accountId: account.id,
        status: 'posted',
        platformPostId: '123456789',
        url: 'https://twitter.com/status/123456789',
        metrics: { likes: 10, retweets: 5 },
      })
      .returning();

    expect(post.id).toBeDefined();
    expect(post.contentId).toBe(item.id);
    expect(post.accountId).toBe(account.id);
    expect(post.status).toBe('posted');
  });

  it('should create job queue entries', async () => {
    const db = testDb.rawDb;

    const [job] = await db
      .insert(jobQueue)
      .values({
        type: 'generate_content',
        payload: { contentItemId: 'test-id' },
        status: 'pending',
      })
      .returning();

    expect(job.id).toBeDefined();
    expect(job.type).toBe('generate_content');
    expect(job.status).toBe('pending');
    expect(job.attempts).toBe(0);
  });

  it('should create metrics snapshots with FK to posts', async () => {
    const db = testDb.rawDb;
    const [post] = await db.select().from(posts);

    const [snapshot] = await db
      .insert(metricsSnapshots)
      .values({
        postId: post.id,
        metrics: { likes: 15, retweets: 7, views: 1000 },
      })
      .returning();

    expect(snapshot.id).toBeDefined();
    expect(snapshot.postId).toBe(post.id);
    expect(snapshot.metrics).toEqual({ likes: 15, retweets: 7, views: 1000 });
  });

  it('should create data sources and trigger rules', async () => {
    const db = testDb.rawDb;

    const [vertical] = await db.select().from(verticals).where(eq(verticals.slug, 'crypto'));

    const [ds] = await db
      .insert(dataSources)
      .values({
        verticalId: vertical.id,
        provider: 'coingecko',
        config: { coinId: 'bitcoin' },
        pollIntervalMs: 30000,
      })
      .returning();

    expect(ds.id).toBeDefined();
    expect(ds.provider).toBe('coingecko');

    const [rule] = await db
      .insert(triggerRules)
      .values({
        verticalId: vertical.id,
        name: 'BTC Pump',
        condition: { type: 'price_change', threshold: 5 },
        fireMode: 'threshold_cross',
        cooldownMs: 3600000,
        enabled: true,
      })
      .returning();

    expect(rule.id).toBeDefined();
    expect(rule.name).toBe('BTC Pump');
    expect(rule.condition).toEqual({ type: 'price_change', threshold: 5 });
  });

  it('should provide a DB instance castable to production DB type', () => {
    // testDb.db is already cast to the production DB type
    // This verifies the cast exists and the object is truthy
    expect(testDb.db).toBeDefined();
  });

  it('should support fresh DB per call (isolation)', () => {
    const db1 = createTestDb();
    const db2 = createTestDb();

    // Each DB should be independent
    expect(db1.db).not.toBe(db2.db);

    db1.close();
    db2.close();
  });
});
