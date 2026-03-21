import { describe, it, expect, vi, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerMetricsRoutes } from '../../src/web/api/metrics.js';

function createMockDb(snapshots: any[] = []) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(snapshots),
        }),
      }),
    }),
  };
}

describe('GET /api/posts/:id/metrics-history', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it('returns postId and ordered snapshots', async () => {
    const snapshots = [
      { collectedAt: '2026-03-20T12:00:00Z', metrics: { likes: 10 } },
      { collectedAt: '2026-03-20T13:00:00Z', metrics: { likes: 25 } },
      { collectedAt: '2026-03-20T14:00:00Z', metrics: { likes: 42 } },
    ];
    const db = createMockDb(snapshots);

    app = Fastify();
    registerMetricsRoutes(app, db as any);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/posts/post-123/metrics-history' });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.postId).toBe('post-123');
    expect(body.snapshots).toHaveLength(3);
    expect(body.snapshots[0].metrics.likes).toBe(10);
    expect(body.snapshots[2].metrics.likes).toBe(42);
  });

  it('returns empty snapshots for post with no metrics history', async () => {
    const db = createMockDb([]);

    app = Fastify();
    registerMetricsRoutes(app, db as any);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/posts/post-999/metrics-history' });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.postId).toBe('post-999');
    expect(body.snapshots).toHaveLength(0);
  });
});
