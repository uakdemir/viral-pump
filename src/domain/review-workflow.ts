import { eq, and } from 'drizzle-orm';
import { contentItems } from '../shared/schema/content-items.js';
import { contentTemplates } from '../shared/schema/content-templates.js';
import { posts } from '../shared/schema/posts.js';
import { accounts } from '../shared/schema/accounts.js';
import { REVIEW_STATUS, JOB_TYPES } from '../shared/constants.js';
import {
  getContentMediaType,
  isCompatible,
  type MediaType,
} from '../shared/platform-compatibility.js';
import { logger as defaultLogger } from '../shared/logger.js';
import type { DB } from '../shared/db.js';
import type { JobQueue } from '../plugins/job-queue/types.js';

/**
 * Pure function: filter accounts by platform compatibility.
 * Exported for testing.
 */
export function filterAccountsByCompatibility(
  activeAccounts: Array<{ platform: string; [key: string]: unknown }>,
  templatePlatform: string | null,
  contentMediaType: MediaType,
): Array<{ platform: string; [key: string]: unknown }> {
  if (templatePlatform) {
    return activeAccounts.filter(a => a.platform === templatePlatform);
  }
  // NULL platform — filter by content compatibility
  return activeAccounts.filter(a => isCompatible(a.platform, contentMediaType));
}

/**
 * Shared: create post rows for compatible accounts and enqueue posting jobs.
 * Platform-aware routing: template.platform filters explicitly, NULL uses COMPATIBLE_PLATFORMS.
 */
async function createPostsForContent(
  db: DB,
  jobQueue: JobQueue,
  contentItemId: string,
  verticalId: string,
  log: typeof defaultLogger = defaultLogger,
): Promise<void> {
  // Get content item and template for routing
  const [contentItem] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId));

  const [template] = contentItem?.templateId
    ? await db
        .select()
        .from(contentTemplates)
        .where(eq(contentTemplates.id, contentItem.templateId))
    : [null];

  // Get all active accounts for this vertical
  const allActiveAccounts = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.verticalId, verticalId), eq(accounts.status, 'active')));

  // Filter by platform compatibility
  const mediaType = getContentMediaType(contentItem?.visualUrl ?? null);
  const targetAccounts = filterAccountsByCompatibility(
    allActiveAccounts,
    template?.platform ?? null,
    mediaType,
  );

  // Zero-match: warn and return — no post rows created
  if (targetAccounts.length === 0) {
    log.warn(
      {
        contentItemId,
        templateName: template?.name,
        templatePlatform: template?.platform,
        mediaType,
      },
      'No matching active accounts — approval succeeded but no posts created',
    );
    return;
  }

  for (const account of targetAccounts as Array<{ id: string; platform: string }>) {
    const inserted = await db
      .insert(posts)
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

export async function approveContent(
  db: DB,
  jobQueue: JobQueue,
  contentItemId: string,
): Promise<boolean> {
  const result = await db
    .update(contentItems)
    .set({ reviewStatus: REVIEW_STATUS.APPROVED, reviewedAt: new Date() })
    .where(
      and(eq(contentItems.id, contentItemId), eq(contentItems.reviewStatus, REVIEW_STATUS.PENDING)),
    )
    .returning({ id: contentItems.id, verticalId: contentItems.verticalId });

  if (result.length === 0) return false;

  await createPostsForContent(db, jobQueue, contentItemId, result[0].verticalId);
  return true;
}

export async function editAndApprove(
  db: DB,
  jobQueue: JobQueue,
  contentItemId: string,
  finalText: string,
): Promise<boolean> {
  const result = await db
    .update(contentItems)
    .set({
      finalText,
      editedAt: new Date(),
      reviewStatus: REVIEW_STATUS.APPROVED,
      reviewedAt: new Date(),
    })
    .where(
      and(eq(contentItems.id, contentItemId), eq(contentItems.reviewStatus, REVIEW_STATUS.PENDING)),
    )
    .returning({ id: contentItems.id, verticalId: contentItems.verticalId });

  if (result.length === 0) return false;

  await createPostsForContent(db, jobQueue, contentItemId, result[0].verticalId);
  return true;
}

export async function rejectContent(
  db: DB,
  contentItemId: string,
  notes?: string,
): Promise<boolean> {
  const result = await db
    .update(contentItems)
    .set({
      reviewStatus: REVIEW_STATUS.REJECTED,
      reviewNotes: notes ?? null,
      reviewedAt: new Date(),
    })
    .where(
      and(eq(contentItems.id, contentItemId), eq(contentItems.reviewStatus, REVIEW_STATUS.PENDING)),
    )
    .returning({ id: contentItems.id });

  return result.length > 0;
}
