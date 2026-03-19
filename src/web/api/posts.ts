import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { posts } from '../../shared/schema/posts.js';
import { contentItems } from '../../shared/schema/content-items.js';
import { accounts } from '../../shared/schema/accounts.js';
import { POST_STATUS, JOB_TYPES } from '../../shared/constants.js';
import type { DB } from '../../shared/db.js';
import type { JobQueue } from '../../plugins/job-queue/types.js';

export function registerPostsRoutes(app: FastifyInstance, db: DB, jobQueue: JobQueue) {
  // GET /api/posts?status=ready|posted|failed
  app.get('/api/posts', async (request) => {
    const { status } = request.query as { status?: string };

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
      language: accounts.language,
    })
      .from(posts)
      .leftJoin(contentItems, eq(posts.contentId, contentItems.id))
      .leftJoin(accounts, eq(posts.accountId, accounts.id))
      .orderBy(desc(posts.createdAt));

    if (status) {
      query = query.where(eq(posts.status, status)) as any;
    }

    return query.limit(50);
  });

  // POST /api/posts/:id/retry — re-enqueue a failed post
  app.post('/api/posts/:id/retry', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [post] = await db.select().from(posts).where(eq(posts.id, id));

    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }
    if (post.status !== POST_STATUS.FAILED) {
      return reply.status(409).send({ error: 'Only failed posts can be retried' });
    }

    await db.update(posts).set({ status: POST_STATUS.READY }).where(eq(posts.id, id));
    await jobQueue.enqueue(JOB_TYPES.POST_TO_PLATFORM, {
      postId: id,
      contentItemId: post.contentId,
      accountId: post.accountId,
    });

    return { ok: true };
  });
}
