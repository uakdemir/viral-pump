import { eq } from 'drizzle-orm';
import { contentItems } from '../../shared/schema/content-items.js';
import { GENERATION_STATUS, REVIEW_STATUS } from '../../shared/constants.js';
import type { DB } from '../../shared/db.js';
import type { Job } from '../../plugins/job-queue/types.js';
import type { VisualGenerator } from '../../plugins/visual-generators/types.js';
import type { AssetStore } from '../../plugins/asset-store/types.js';

interface GenerateVisualDeps {
  db: DB;
  visualGenerator: VisualGenerator;
  assetStore: AssetStore;
  logger: { info: (...args: any[]) => void; error: (...args: any[]) => void };
}

export async function handleGenerateVisual(job: Job, deps: GenerateVisualDeps): Promise<void> {
  const { contentItemId, templateConfig, context } = job.payload as {
    contentItemId: string;
    templateConfig: Record<string, unknown>;
    context: Record<string, unknown>;
  };

  try {
    const buffer = await deps.visualGenerator.generate({
      contentItemId,
      templateConfig,
      context,
    });

    const visualUrl = await deps.assetStore.store(contentItemId, buffer, 'png');

    // Persist media metadata for downstream platform validation
    const width = (templateConfig?.config as any)?.width ?? 1200;
    const height = (templateConfig?.config as any)?.height ?? 628;
    const mediaMeta = {
      mimeType: 'image/png',
      width,
      height,
      fileSizeBytes: buffer.length,
    };

    await deps.db
      .update(contentItems)
      .set({
        visualUrl,
        mediaMeta,
        generationStatus: GENERATION_STATUS.READY,
        reviewStatus: REVIEW_STATUS.PENDING,
      })
      .where(eq(contentItems.id, contentItemId));

    deps.logger.info({ contentItemId, visualUrl }, 'Visual generated, content ready for review');
  } catch (err) {
    await deps.db
      .update(contentItems)
      .set({ generationStatus: GENERATION_STATUS.FAILED })
      .where(eq(contentItems.id, contentItemId));
    throw err;
  }
}
