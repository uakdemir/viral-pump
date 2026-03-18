import { eq, and } from 'drizzle-orm';
import { contentItems } from '../shared/schema/content-items.js';
import { posts } from '../shared/schema/posts.js';
import { accounts } from '../shared/schema/accounts.js';
import type { DB } from '../shared/db.js';
import type { JobQueue } from '../plugins/job-queue/types.js';

export async function approveContent(db: DB, jobQueue: JobQueue, contentItemId: string): Promise<boolean> {
  const result = await db.update(contentItems)
    .set({ reviewStatus: 'approved', reviewedAt: new Date() })
    .where(and(
      eq(contentItems.id, contentItemId),
      eq(contentItems.reviewStatus, 'pending'),
    ))
    .returning({ id: contentItems.id, verticalId: contentItems.verticalId });

  if (result.length === 0) return false;

  const activeAccounts = await db.select()
    .from(accounts)
    .where(and(
      eq(accounts.verticalId, result[0].verticalId),
      eq(accounts.status, 'active'),
    ));

  for (const account of activeAccounts) {
    const inserted = await db.insert(posts)
      .values({ contentId: contentItemId, accountId: account.id })
      .onConflictDoNothing()
      .returning({ id: posts.id });

    if (inserted.length > 0) {
      await jobQueue.enqueue('post-to-platform', {
        postId: inserted[0].id,
        contentItemId,
        accountId: account.id,
      });
    }
  }

  return true;
}

export async function editAndApprove(
  db: DB, jobQueue: JobQueue, contentItemId: string, finalText: string,
): Promise<boolean> {
  const result = await db.update(contentItems)
    .set({
      finalText,
      editedAt: new Date(),
      reviewStatus: 'approved',
      reviewedAt: new Date(),
    })
    .where(and(
      eq(contentItems.id, contentItemId),
      eq(contentItems.reviewStatus, 'pending'),
    ))
    .returning({ id: contentItems.id, verticalId: contentItems.verticalId });

  if (result.length === 0) return false;

  const activeAccounts = await db.select()
    .from(accounts)
    .where(and(
      eq(accounts.verticalId, result[0].verticalId),
      eq(accounts.status, 'active'),
    ));

  for (const account of activeAccounts) {
    const inserted = await db.insert(posts)
      .values({ contentId: contentItemId, accountId: account.id })
      .onConflictDoNothing()
      .returning({ id: posts.id });

    if (inserted.length > 0) {
      await jobQueue.enqueue('post-to-platform', {
        postId: inserted[0].id,
        contentItemId,
        accountId: account.id,
      });
    }
  }

  return true;
}

export async function rejectContent(
  db: DB, contentItemId: string, notes?: string,
): Promise<boolean> {
  const result = await db.update(contentItems)
    .set({
      reviewStatus: 'rejected',
      reviewNotes: notes ?? null,
      reviewedAt: new Date(),
    })
    .where(and(
      eq(contentItems.id, contentItemId),
      eq(contentItems.reviewStatus, 'pending'),
    ))
    .returning({ id: contentItems.id });

  return result.length > 0;
}
