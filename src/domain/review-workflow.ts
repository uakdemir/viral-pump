import { eq, and } from 'drizzle-orm';
import { contentItems } from '../shared/schema/content-items.js';
import { posts } from '../shared/schema/posts.js';
import { accounts } from '../shared/schema/accounts.js';
import { REVIEW_STATUS, POST_STATUS, JOB_TYPES } from '../shared/constants.js';
import type { DB } from '../shared/db.js';
import type { JobQueue } from '../plugins/job-queue/types.js';

/**
 * Shared: create post rows for all active accounts in the vertical and enqueue posting jobs.
 */
async function createPostsForContent(
  db: DB, jobQueue: JobQueue, contentItemId: string, verticalId: string,
): Promise<void> {
  const activeAccounts = await db.select()
    .from(accounts)
    .where(and(
      eq(accounts.verticalId, verticalId),
      eq(accounts.status, 'active'),
    ));

  for (const account of activeAccounts) {
    const inserted = await db.insert(posts)
      .values({ contentId: contentItemId, accountId: account.id })
      .onConflictDoNothing()
      .returning({ id: posts.id });

    if (inserted.length > 0) {
      await jobQueue.enqueue(JOB_TYPES.POST_TO_PLATFORM, {
        postId: inserted[0].id,
        contentItemId,
        accountId: account.id,
      });
    }
  }
}

export async function approveContent(db: DB, jobQueue: JobQueue, contentItemId: string): Promise<boolean> {
  const result = await db.update(contentItems)
    .set({ reviewStatus: REVIEW_STATUS.APPROVED, reviewedAt: new Date() })
    .where(and(
      eq(contentItems.id, contentItemId),
      eq(contentItems.reviewStatus, REVIEW_STATUS.PENDING),
    ))
    .returning({ id: contentItems.id, verticalId: contentItems.verticalId });

  if (result.length === 0) return false;

  await createPostsForContent(db, jobQueue, contentItemId, result[0].verticalId);
  return true;
}

export async function editAndApprove(
  db: DB, jobQueue: JobQueue, contentItemId: string, finalText: string,
): Promise<boolean> {
  const result = await db.update(contentItems)
    .set({
      finalText,
      editedAt: new Date(),
      reviewStatus: REVIEW_STATUS.APPROVED,
      reviewedAt: new Date(),
    })
    .where(and(
      eq(contentItems.id, contentItemId),
      eq(contentItems.reviewStatus, REVIEW_STATUS.PENDING),
    ))
    .returning({ id: contentItems.id, verticalId: contentItems.verticalId });

  if (result.length === 0) return false;

  await createPostsForContent(db, jobQueue, contentItemId, result[0].verticalId);
  return true;
}

export async function rejectContent(
  db: DB, contentItemId: string, notes?: string,
): Promise<boolean> {
  const result = await db.update(contentItems)
    .set({
      reviewStatus: REVIEW_STATUS.REJECTED,
      reviewNotes: notes ?? null,
      reviewedAt: new Date(),
    })
    .where(and(
      eq(contentItems.id, contentItemId),
      eq(contentItems.reviewStatus, REVIEW_STATUS.PENDING),
    ))
    .returning({ id: contentItems.id });

  return result.length > 0;
}
