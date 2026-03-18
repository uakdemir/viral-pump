import { eq } from 'drizzle-orm';
import { posts } from '../../shared/schema/posts.js';
import { contentItems } from '../../shared/schema/content-items.js';
import { accounts } from '../../shared/schema/accounts.js';
import type { DB } from '../../shared/db.js';
import type { Job } from '../../plugins/job-queue/types.js';
import type { PostingStrategy } from '../../plugins/posting-strategies/types.js';
import type { AssetStore } from '../../plugins/asset-store/types.js';
import type { PluginRegistry } from '../../plugins/registry.js';

interface PostToPlatformDeps {
  db: DB;
  postingStrategyRegistry: PluginRegistry<PostingStrategy>;
  appCredentials: { apiKey: string; apiSecret: string };
  assetStore: AssetStore;
  logger: { info: (...args: any[]) => void; error: (...args: any[]) => void };
}

export async function handlePostToPlatform(job: Job, deps: PostToPlatformDeps): Promise<void> {
  const { postId, contentItemId, accountId } = job.payload as {
    postId: string;
    contentItemId: string;
    accountId: string;
  };

  // Get content and account
  const [item] = await deps.db.select().from(contentItems)
    .where(eq(contentItems.id, contentItemId));
  if (!item) throw new Error(`Content item not found: ${contentItemId}`);

  const [account] = await deps.db.select().from(accounts)
    .where(eq(accounts.id, accountId));
  if (!account) throw new Error(`Account not found: ${accountId}`);

  // Resolve posting strategy with per-account credentials
  // App-level keys (API key/secret) come from env, per-account tokens come from DB
  const accountCreds = account.credentials as Record<string, string>;
  const accountConfig = account.config as Record<string, string>;
  const strategyName = accountConfig.postingStrategy ?? 'twitter-api';

  const postingStrategy = deps.postingStrategyRegistry.resolve(strategyName, {
    apiKey: deps.appCredentials.apiKey,
    apiSecret: deps.appCredentials.apiSecret,
    accessToken: accountCreds.accessToken,
    accessTokenSecret: accountCreds.accessTokenSecret,
  });

  // Use final_text if edited, otherwise generated_text
  const text = item.finalText ?? item.generatedText ?? '';

  // Resolve image path if visual exists
  let imagePath: string | undefined;
  if (item.visualUrl) {
    imagePath = deps.assetStore.resolve(item.visualUrl);
  }

  try {
    const result = await postingStrategy.post({ text, imagePath });

    await deps.db.update(posts)
      .set({
        status: 'posted',
        postedAt: result.postedAt,
        platformPostId: result.platformPostId,
      })
      .where(eq(posts.id, postId));

    deps.logger.info({
      postId,
      accountName: account.name,
      platformPostId: result.platformPostId,
    }, 'Posted to platform');
  } catch (err) {
    await deps.db.update(posts)
      .set({ status: 'failed' })
      .where(eq(posts.id, postId));
    throw err;
  }
}
