import { eq } from 'drizzle-orm';
import { contentItems } from '../../shared/schema/content-items.js';
import { contentTemplates } from '../../shared/schema/content-templates.js';
import { verticals } from '../../shared/schema/verticals.js';
import type { DB } from '../../shared/db.js';
import type { Job, JobQueue } from '../../plugins/job-queue/types.js';
import type { ContentGenerator } from '../../plugins/content-generators/types.js';
import type { PluginRegistry } from '../../plugins/registry.js';

interface GenerateContentDeps {
  db: DB;
  jobQueue: JobQueue;
  contentGeneratorRegistry: PluginRegistry<ContentGenerator>;
  logger: { info: (...args: any[]) => void; error: (...args: any[]) => void };
}

export async function handleGenerateContent(job: Job, deps: GenerateContentDeps): Promise<void> {
  const { verticalId, templateId, eventData } = job.payload as {
    verticalId: string;
    templateId: string;
    eventData: Record<string, unknown>;
  };

  // Get template
  const [template] = await deps.db.select().from(contentTemplates)
    .where(eq(contentTemplates.id, templateId));
  if (!template) throw new Error(`Template not found: ${templateId}`);

  // Get vertical config for defaults
  const [vertical] = await deps.db.select().from(verticals)
    .where(eq(verticals.id, verticalId));
  const defaults = (vertical?.config as any)?.defaults ?? {};

  // Resolve content generator
  const genConfig = template.generationConfig as Record<string, unknown>;
  const providerName = (genConfig.provider as string) ?? defaults.contentGenerator?.provider ?? 'claude';
  const model = (genConfig.model as string) ?? defaults.contentGenerator?.model ?? 'claude-haiku-4-5-20251001';

  // Create content item in "generating" state
  const [item] = await deps.db.insert(contentItems).values({
    verticalId,
    templateId,
    eventData,
    generationStatus: 'generating',
    reviewStatus: 'draft',
    aiConfig: { provider: providerName, model, templateName: template.name },
  }).returning({ id: contentItems.id });

  try {
    // Resolve generator from registry — we need apiKey from env, merge with config
    const generator = deps.contentGeneratorRegistry.resolve(providerName, { model });

    const start = Date.now();
    const result = await generator.generate({
      event: eventData as any,
      promptTemplate: template.promptTemplate,
      generationConfig: genConfig,
    });

    // Update content item with generated text
    await deps.db.update(contentItems)
      .set({
        generatedText: result.text,
        aiConfig: { provider: providerName, model: result.model, tokensUsed: result.tokensUsed },
        cost: { apiTokens: result.tokensUsed, generationTimeMs: result.durationMs },
      })
      .where(eq(contentItems.id, item.id));

    deps.logger.info({ contentItemId: item.id, tokens: result.tokensUsed }, 'Content generated');

    // Enqueue visual generation
    const visualConfig = template.visualTemplate as Record<string, unknown>;
    await deps.jobQueue.enqueue('generate-visual', {
      contentItemId: item.id,
      generatedText: result.text,
      eventData,
      visualConfig,
    });
  } catch (err) {
    await deps.db.update(contentItems)
      .set({ generationStatus: 'failed' })
      .where(eq(contentItems.id, item.id));
    throw err; // let job queue handle retry
  }
}
