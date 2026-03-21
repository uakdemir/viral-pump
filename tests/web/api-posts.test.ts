import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerPostsRoutes } from '../../src/web/api/posts.js';

// --- Mock helpers ---

function createMockJobQueue() {
  return { enqueue: vi.fn().mockResolvedValue(undefined) } as any;
}

// Minimal mock DB that supports the chained Drizzle query patterns used in posts.ts
function createMockDb(opts: {
  queryItems?: any[];
  summaryRow?: Record<string, any>;
  singlePost?: any;
} = {}) {
  const { queryItems = [], summaryRow = {}, singlePost = undefined } = opts;

  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(queryItems),
      }),
      where: vi.fn().mockResolvedValue(singlePost ? [singlePost] : []),
    }),
    execute: vi.fn().mockResolvedValue([{
      total_posts: summaryRow.totalPosts ?? 0,
      total_views: summaryRow.totalViews ?? 0,
      total_likes: summaryRow.totalLikes ?? 0,
      total_shares: summaryRow.totalShares ?? 0,
      total_comments: summaryRow.totalComments ?? 0,
    }]),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  };

  return db;
}

describe('GET /api/posts', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it('returns bare array when summary not requested', async () => {
    const items = [
      { id: 'p1', status: 'posted', postedAt: '2026-03-20T12:00:00Z' },
      { id: 'p2', status: 'posted', postedAt: '2026-03-20T11:00:00Z' },
    ];
    const db = createMockDb({ queryItems: items });
    const jobQueue = createMockJobQueue();

    app = Fastify();
    registerPostsRoutes(app, db as any, jobQueue);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/posts?status=posted' });
    const body = JSON.parse(res.body);

    // Should be a plain array (backwards-compatible)
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe('p1');
  });

  it('returns { items, summary } when summary=true', async () => {
    const items = [{ id: 'p1', status: 'posted' }];
    const summaryRow = { totalPosts: 5, totalViews: 1200, totalLikes: 45, totalShares: 12, totalComments: 3 };
    const db = createMockDb({ queryItems: items, summaryRow });
    const jobQueue = createMockJobQueue();

    app = Fastify();
    registerPostsRoutes(app, db as any, jobQueue);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/posts?status=posted&summary=true' });
    const body = JSON.parse(res.body);

    expect(body.items).toBeDefined();
    expect(body.summary).toBeDefined();
    expect(body.summary.totalPosts).toBe(5);
    expect(body.summary.totalViews).toBe(1200);
    expect(body.summary.totalLikes).toBe(45);
    expect(body.summary.totalShares).toBe(12);
    expect(body.summary.totalComments).toBe(3);
  });

  it('summary with no metrics returns zeroed totals', async () => {
    const db = createMockDb({ queryItems: [], summaryRow: {} });
    const jobQueue = createMockJobQueue();

    app = Fastify();
    registerPostsRoutes(app, db as any, jobQueue);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/posts?summary=true' });
    const body = JSON.parse(res.body);

    expect(body.summary.totalPosts).toBe(0);
    expect(body.summary.totalViews).toBe(0);
    expect(body.summary.totalLikes).toBe(0);
  });

  it('accepts filter params without error', async () => {
    const db = createMockDb({ queryItems: [] });
    const jobQueue = createMockJobQueue();

    app = Fastify();
    registerPostsRoutes(app, db as any, jobQueue);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/posts?status=posted&platform=twitter&vertical=gold-forex&since=2026-03-01T00:00:00Z&until=2026-03-21T00:00:00Z',
    });

    expect(res.statusCode).toBe(200);
  });
});

// The retry route uses a different chain: db.select().from(posts).where() → awaited directly
// So we need a dedicated mock that handles both GET and POST chains
function createRetryMockDb(post: any | undefined) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(post ? [post] : []),
        leftJoin: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
    execute: vi.fn().mockResolvedValue([{}]),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  };
}

describe('POST /api/posts/:id/retry', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it('returns 404 for non-existent post', async () => {
    const db = createRetryMockDb(undefined);
    const jobQueue = createMockJobQueue();

    app = Fastify();
    registerPostsRoutes(app, db as any, jobQueue);
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/api/posts/nonexistent/retry' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 for non-failed post', async () => {
    const db = createRetryMockDb({ id: 'p1', status: 'posted' });
    const jobQueue = createMockJobQueue();

    app = Fastify();
    registerPostsRoutes(app, db as any, jobQueue);
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/api/posts/p1/retry' });
    expect(res.statusCode).toBe(409);
  });
});
