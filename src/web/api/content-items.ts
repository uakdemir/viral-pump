import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { contentItems } from '../../shared/schema/content-items.js';
import { GENERATION_STATUS, REVIEW_STATUS } from '../../shared/constants.js';
import type { DB } from '../../shared/db.js';
import type { JobQueue } from '../../plugins/job-queue/types.js';
import { approveContent, editAndApprove, rejectContent } from '../../domain/review-workflow.js';

export function registerContentItemsRoutes(app: FastifyInstance, db: DB, jobQueue: JobQueue) {
  // GET /api/content-items?status=pending
  app.get('/api/content-items', async request => {
    const { status } = request.query as { status?: string };

    let query = db.select().from(contentItems).orderBy(desc(contentItems.createdAt));

    if (status === REVIEW_STATUS.PENDING) {
      query = query.where(
        and(
          eq(contentItems.generationStatus, GENERATION_STATUS.READY),
          eq(contentItems.reviewStatus, REVIEW_STATUS.PENDING),
        ),
      ) as any;
    } else if (status) {
      query = query.where(eq(contentItems.reviewStatus, status)) as any;
    }

    return query.limit(50);
  });

  // POST /api/content-items/:id/approve
  app.post('/api/content-items/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    const success = await approveContent(db, jobQueue, id);
    if (!success) {
      return reply.status(409).send({ error: 'Content is not in pending state' });
    }
    return { ok: true };
  });

  // POST /api/content-items/:id/edit-approve
  app.post('/api/content-items/:id/edit-approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { finalText } = request.body as { finalText: string };
    if (!finalText) {
      return reply.status(400).send({ error: 'finalText is required' });
    }
    const success = await editAndApprove(db, jobQueue, id, finalText);
    if (!success) {
      return reply.status(409).send({ error: 'Content is not in pending state' });
    }
    return { ok: true };
  });

  // POST /api/content-items/:id/reject
  app.post('/api/content-items/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { notes } = request.body as { notes?: string };
    const success = await rejectContent(db, id, notes);
    if (!success) {
      return reply.status(409).send({ error: 'Content is not in pending state' });
    }
    return { ok: true };
  });
}
