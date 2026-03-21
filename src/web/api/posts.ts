import type { FastifyInstance } from 'fastify';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';
import { posts } from '../../shared/schema/posts.js';
import { contentItems } from '../../shared/schema/content-items.js';
import { accounts } from '../../shared/schema/accounts.js';
import { verticals } from '../../shared/schema/verticals.js';
import { POST_STATUS, JOB_TYPES } from '../../shared/constants.js';
import type { DB } from '../../shared/db.js';
import type { JobQueue } from '../../plugins/job-queue/types.js';

export function registerPostsRoutes(app: FastifyInstance, db: DB, jobQueue: JobQueue) {
  // GET /api/posts?status=&platform=&vertical=&since=&until=&summary=true
  app.get('/api/posts', async request => {
    const { status, platform, vertical, since, until, summary } = request.query as {
      status?: string;
      platform?: string;
      vertical?: string;
      since?: string;
      until?: string;
      summary?: string;
    };

    // Build WHERE conditions
    const conditions: any[] = [];
    if (status) conditions.push(eq(posts.status, status));
    if (platform) conditions.push(eq(accounts.platform, platform));
    if (vertical) conditions.push(eq(verticals.slug, vertical));
    if (since) conditions.push(gte(posts.postedAt, new Date(since)));
    if (until) conditions.push(lte(posts.postedAt, new Date(until)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Main query — paginated items
    let query = db
      .select({
        id: posts.id,
        contentId: posts.contentId,
        accountId: posts.accountId,
        status: posts.status,
        postedAt: posts.postedAt,
        platformPostId: posts.platformPostId,
        url: posts.url,
        failureReason: posts.failureReason,
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
      .leftJoin(verticals, eq(contentItems.verticalId, verticals.id))
      .orderBy(desc(posts.createdAt));

    if (whereClause) {
      query = query.where(whereClause) as any;
    }

    const items = await query.limit(50);

    // If summary requested, compute aggregates over FULL filtered set (not just page)
    if (summary === 'true') {
      const summaryResult = await db.execute(sql`
        SELECT
          COUNT(*)::int as total_posts,
          COALESCE(SUM((p.metrics->>'views')::int), 0)::int as total_views,
          COALESCE(SUM((p.metrics->>'likes')::int), 0)::int as total_likes,
          COALESCE(SUM((p.metrics->>'shares')::int), 0)::int as total_shares,
          COALESCE(SUM((p.metrics->>'comments')::int), 0)::int as total_comments
        FROM posts p
        LEFT JOIN content_items ci ON ci.id = p.content_id
        LEFT JOIN accounts a ON a.id = p.account_id
        LEFT JOIN verticals v ON v.id = ci.vertical_id
        WHERE 1=1
          ${status ? sql`AND p.status = ${status}` : sql``}
          ${platform ? sql`AND a.platform = ${platform}` : sql``}
          ${vertical ? sql`AND v.slug = ${vertical}` : sql``}
          ${since ? sql`AND p.posted_at >= ${since}::timestamptz` : sql``}
          ${until ? sql`AND p.posted_at <= ${until}::timestamptz` : sql``}
      `);

      const row = (summaryResult as any)[0] ?? {};

      return {
        items,
        summary: {
          totalPosts: row.total_posts ?? 0,
          totalViews: row.total_views ?? 0,
          totalLikes: row.total_likes ?? 0,
          totalShares: row.total_shares ?? 0,
          totalComments: row.total_comments ?? 0,
        },
      };
    }

    // Default: bare array (backwards compatible)
    return items;
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

    await db
      .update(posts)
      .set({
        status: POST_STATUS.READY,
        failureReason: null,
        postedAt: null,
        platformPostId: null,
        url: null,
      })
      .where(eq(posts.id, id));
    await jobQueue.enqueue(JOB_TYPES.POST_TO_PLATFORM, {
      postId: id,
      contentItemId: post.contentId,
      accountId: post.accountId,
    });

    return { ok: true };
  });
}
