import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { contentItems } from '../../shared/schema/content-items.js';
import { contentTemplates } from '../../shared/schema/content-templates.js';
import type { DB } from '../../shared/db.js';
import type { JobQueue } from '../../plugins/job-queue/types.js';
import { approveContent, editAndApprove, rejectContent } from '../../domain/review-workflow.js';

export function createContentItemsRouter(db: DB, jobQueue: JobQueue): Router {
  const router = Router();

  // GET /api/content-items?status=pending
  router.get('/', async (req, res) => {
    try {
      const status = req.query.status as string | undefined;

      let query = db.select({
        id: contentItems.id,
        verticalId: contentItems.verticalId,
        templateId: contentItems.templateId,
        eventData: contentItems.eventData,
        generatedText: contentItems.generatedText,
        visualUrl: contentItems.visualUrl,
        generationStatus: contentItems.generationStatus,
        reviewStatus: contentItems.reviewStatus,
        finalText: contentItems.finalText,
        reviewNotes: contentItems.reviewNotes,
        aiConfig: contentItems.aiConfig,
        cost: contentItems.cost,
        createdAt: contentItems.createdAt,
        reviewedAt: contentItems.reviewedAt,
        editedAt: contentItems.editedAt,
      }).from(contentItems).orderBy(desc(contentItems.createdAt));

      if (status === 'pending') {
        query = query.where(and(
          eq(contentItems.generationStatus, 'ready'),
          eq(contentItems.reviewStatus, 'pending'),
        )) as any;
      } else if (status) {
        query = query.where(eq(contentItems.reviewStatus, status)) as any;
      }

      const items = await query.limit(50);
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch content items' });
    }
  });

  // POST /api/content-items/:id/approve
  router.post('/:id/approve', async (req, res) => {
    try {
      const success = await approveContent(db, jobQueue, req.params.id);
      if (!success) {
        res.status(409).json({ error: 'Content item not in pending state' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to approve content' });
    }
  });

  // POST /api/content-items/:id/edit-approve
  router.post('/:id/edit-approve', async (req, res) => {
    try {
      const { finalText } = req.body as { finalText: string };
      if (!finalText) {
        res.status(400).json({ error: 'finalText is required' });
        return;
      }
      const success = await editAndApprove(db, jobQueue, req.params.id, finalText);
      if (!success) {
        res.status(409).json({ error: 'Content item not in pending state' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to edit and approve content' });
    }
  });

  // POST /api/content-items/:id/reject
  router.post('/:id/reject', async (req, res) => {
    try {
      const { notes } = req.body as { notes?: string };
      const success = await rejectContent(db, req.params.id, notes);
      if (!success) {
        res.status(409).json({ error: 'Content item not in pending state' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to reject content' });
    }
  });

  return router;
}
