import { eq } from 'drizzle-orm';
import { contentItems } from '../../shared/schema/content-items.js';
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
  const { contentItemId, generatedText, eventData, visualConfig } = job.payload as {
    contentItemId: string;
    generatedText: string;
    eventData: Record<string, unknown>;
    visualConfig: Record<string, unknown>;
  };

  try {
    const buffer = await deps.visualGenerator.generate({
      contentItemId,
      generatedText,
      eventData,
      templateConfig: visualConfig?.config as Record<string, unknown> ?? {},
    });

    const visualUrl = await deps.assetStore.store(contentItemId, buffer, 'png');

    await deps.db.update(contentItems)
      .set({
        visualUrl,
        generationStatus: 'ready',
        reviewStatus: 'pending',
      })
      .where(eq(contentItems.id, contentItemId));

    deps.logger.info({ contentItemId, visualUrl }, 'Visual generated, content ready for review');
  } catch (err) {
    await deps.db.update(contentItems)
      .set({ generationStatus: 'failed' })
      .where(eq(contentItems.id, contentItemId));
    throw err;
  }
}
