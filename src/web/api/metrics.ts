import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { metricsSnapshots } from '../../shared/schema/metrics-snapshots.js';
import type { DB } from '../../shared/db.js';

export function registerMetricsRoutes(app: FastifyInstance, db: DB) {
  app.get('/api/posts/:id/metrics-history', async (request) => {
    const { id } = request.params as { id: string };

    const snapshots = await db.select({
      collectedAt: metricsSnapshots.collectedAt,
      metrics: metricsSnapshots.metrics,
    })
      .from(metricsSnapshots)
      .where(eq(metricsSnapshots.postId, id))
      .orderBy(metricsSnapshots.collectedAt);

    return {
      postId: id,
      snapshots,
    };
  });
}
