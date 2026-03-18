import { Router } from 'express';
import { eq, desc } from 'drizzle-orm';
import { posts } from '../../shared/schema/posts.js';
import { contentItems } from '../../shared/schema/content-items.js';
import { accounts } from '../../shared/schema/accounts.js';
import type { DB } from '../../shared/db.js';
import type { JobQueue } from '../../plugins/job-queue/types.js';

export function createPostsRouter(db: DB, jobQueue: JobQueue): Router {
  const router = Router();

  // GET /api/posts?status=posted
  router.get('/', async (req, res) => {
    try {
      const status = req.query.status as string | undefined;

      let query = db.select({
        id: posts.id,
        contentId: posts.contentId,
        accountId: posts.accountId,
        status: posts.status,
        postedAt: posts.postedAt,
        platformPostId: posts.platformPostId,
        metrics: posts.metrics,
        createdAt: posts.createdAt,
        generatedText: contentItems.generatedText,
        finalText: contentItems.finalText,
        visualUrl: contentItems.visualUrl,
        templateId: contentItems.templateId,
        accountName: accounts.name,
        platform: accounts.platform,
      })
        .from(posts)
        .leftJoin(contentItems, eq(posts.contentId, contentItems.id))
        .leftJoin(accounts, eq(posts.accountId, accounts.id))
        .orderBy(desc(posts.createdAt));

      if (status) {
        query = query.where(eq(posts.status, status)) as any;
      }

      const result = await query.limit(50);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch posts' });
    }
  });

  // POST /api/posts/:id/retry — re-enqueue a failed post
  router.post('/:id/retry', async (req, res) => {
    try {
      const [post] = await db.select().from(posts).where(eq(posts.id, req.params.id));
      if (!post) {
        res.status(404).json({ error: 'Post not found' });
        return;
      }
      if (post.status !== 'failed') {
        res.status(409).json({ error: 'Only failed posts can be retried' });
        return;
      }

      // Reset status and enqueue
      await db.update(posts)
        .set({ status: 'ready' })
        .where(eq(posts.id, post.id));

      await jobQueue.enqueue('post-to-platform', {
        postId: post.id,
        contentItemId: post.contentId,
        accountId: post.accountId,
      });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retry post' });
    }
  });

  return router;
}
