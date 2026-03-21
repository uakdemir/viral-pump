import { eq } from 'drizzle-orm';
import { posts } from '../../shared/schema/posts.js';
import { contentItems } from '../../shared/schema/content-items.js';
import { contentTemplates } from '../../shared/schema/content-templates.js';
import { accounts } from '../../shared/schema/accounts.js';
import { POST_STATUS } from '../../shared/constants.js';
import { DryRunPostingStrategy } from '../../plugins/posting-strategies/dry-run.js';
import type { DB } from '../../shared/db.js';
import type { Job } from '../../plugins/job-queue/types.js';
import type {
  PostingStrategy,
  PostInput,
  MediaInput,
} from '../../plugins/posting-strategies/types.js';
import type { AssetStore } from '../../plugins/asset-store/types.js';
import type { PluginRegistry } from '../../plugins/registry.js';

interface PostToPlatformDeps {
  db: DB;
  postingStrategyRegistry: PluginRegistry<PostingStrategy>;
  appCredentials: { apiKey: string; apiSecret: string };
  assetStore: AssetStore;
  assetDir: string;
  logger: {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
}

export async function handlePostToPlatform(job: Job, deps: PostToPlatformDeps): Promise<void> {
  const { postId, contentItemId, accountId } = job.payload as {
    postId: string;
    contentItemId: string;
    accountId: string;
  };

  // Get content item and account
  const [item] = await deps.db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId));
  if (!item) throw new Error(`Content item not found: ${contentItemId}`);

  const [account] = await deps.db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!account) throw new Error(`Account not found: ${accountId}`);

  // Fetch template for platformMeta merge
  const [template] = item.templateId
    ? await deps.db.select().from(contentTemplates).where(eq(contentTemplates.id, item.templateId))
    : [null];

  // Step 1: Resolve posting strategy
  const accountCreds = account.credentials as Record<string, unknown>;
  const accountConfig = account.config as Record<string, unknown>;
  const strategyName = (accountConfig.postingStrategy as string) ?? 'twitter-api';

  // Pass full merged credentials — each strategy constructor picks what it needs
  const strategyConfig = {
    ...deps.appCredentials,
    ...(accountCreds as Record<string, unknown>),
    ...(accountConfig as Record<string, unknown>),
  };

  // Resolve strategy — unknown/misspelled strategy names are config errors, not transient failures
  let postingStrategy: PostingStrategy;
  try {
    postingStrategy = deps.postingStrategyRegistry.resolve(strategyName, strategyConfig);
  } catch (err) {
    await deps.db
      .update(posts)
      .set({
        status: POST_STATUS.FAILED,
        failureReason: `Unknown posting strategy: ${strategyName}. Check accounts.config.postingStrategy.`,
      })
      .where(eq(posts.id, postId));
    deps.logger.warn({ postId, strategyName }, 'Unknown posting strategy — config error, no retry');
    return;
  }

  // Step 2: Build PostInput
  const text = item.finalText ?? item.generatedText ?? '';

  // Build media from mediaMeta (single source of truth)
  let media: MediaInput | undefined;
  if (item.visualUrl) {
    const mm = (item.mediaMeta ?? {}) as Record<string, unknown>;
    media = {
      type: ((mm.mimeType as string) ?? '').startsWith('video/') ? 'video' : 'image',
      path: deps.assetStore.resolve(item.visualUrl), // local path for file-upload strategies (Twitter, Telegram)
      publicUrl: deps.assetStore.getPublicUrl(item.visualUrl), // public URL for URL-based strategies (Instagram, Pinterest)
      mimeType: (mm.mimeType as string) ?? 'image/png',
      width: mm.width as number | undefined,
      height: mm.height as number | undefined,
      fileSizeBytes: mm.fileSizeBytes as number | undefined,
    };
  }

  // Merge platformMeta: account defaults + template overrides
  const accountMeta = (accountConfig.platformMeta ?? {}) as Record<string, unknown>;
  const templateMeta = (template?.platformMeta ?? {}) as Record<string, unknown>;
  const platformMeta = { ...accountMeta, ...templateMeta };

  const postInput: PostInput = { text, media, platformMeta };

  // Step 3: Validate input — config errors don't retry
  try {
    postingStrategy.validateInput(postInput);
  } catch (err) {
    await deps.db
      .update(posts)
      .set({
        status: POST_STATUS.FAILED,
        failureReason: err instanceof Error ? err.message : String(err),
      })
      .where(eq(posts.id, postId));
    deps.logger.warn(
      { postId, error: (err as Error).message },
      'Post validation failed — config error, no retry',
    );
    return; // don't throw — job completes, no retry
  }

  // Step 4: Dry-run check — validate passed, skip real post
  const isDryRun = (accountConfig.dryRun as boolean) ?? false;
  if (isDryRun) {
    const dryRunStrategy = new DryRunPostingStrategy({ outputDir: deps.assetDir + '/dry-run' });
    const result = await dryRunStrategy.post(postInput);
    await deps.db
      .update(posts)
      .set({
        status: POST_STATUS.POSTED,
        postedAt: result.postedAt,
        platformPostId: result.platformPostId,
      })
      .where(eq(posts.id, postId));
    deps.logger.info(
      { postId, accountName: account.name, dryRun: true },
      'Dry-run post (validated against real platform)',
    );
    return;
  }

  // Step 5: Real post
  try {
    const result = await postingStrategy.post(postInput);

    await deps.db
      .update(posts)
      .set({
        status: POST_STATUS.POSTED,
        postedAt: result.postedAt,
        platformPostId: result.platformPostId,
        url: result.url ?? null,
        failureReason: null, // clear any stale failure reason from previous attempts
      })
      .where(eq(posts.id, postId));

    deps.logger.info(
      {
        postId,
        accountName: account.name,
        platformPostId: result.platformPostId,
        url: result.url,
      },
      'Posted to platform',
    );
  } catch (err) {
    await deps.db
      .update(posts)
      .set({
        status: POST_STATUS.FAILED,
        failureReason: err instanceof Error ? err.message : String(err),
      })
      .where(eq(posts.id, postId));
    throw err; // transient error — job queue retries
  }
}
