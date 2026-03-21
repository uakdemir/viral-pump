import { eq } from 'drizzle-orm';
import { contentItems } from '../../shared/schema/content-items.js';
import {
  GENERATION_STATUS,
  REVIEW_STATUS,
  JOB_TYPES,
  DEFAULT_LLM_MODEL,
} from '../../shared/constants.js';
import { contentTemplates } from '../../shared/schema/content-templates.js';
import { verticals } from '../../shared/schema/verticals.js';
import { triggerRules } from '../../shared/schema/trigger-rules.js';
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
  const { verticalId, templateId, eventData, ruleId } = job.payload as {
    verticalId: string;
    templateId: string;
    eventData: {
      source: string;
      type: string;
      data: Record<string, unknown>;
      [key: string]: unknown;
    };
    ruleId?: string;
  };

  // Get template
  const [template] = await deps.db
    .select()
    .from(contentTemplates)
    .where(eq(contentTemplates.id, templateId));
  if (!template) throw new Error(`Template not found: ${templateId}`);

  // Get vertical config for defaults
  const [vertical] = await deps.db.select().from(verticals).where(eq(verticals.id, verticalId));
  const defaults = (vertical?.config as any)?.defaults ?? {};

  // Resolve content generator
  const genConfig = template.generationConfig as Record<string, unknown>;
  const providerName =
    (genConfig.provider as string) ?? defaults.contentGenerator?.provider ?? 'claude';
  const model =
    (genConfig.model as string) ?? defaults.contentGenerator?.model ?? DEFAULT_LLM_MODEL;

  // Create content item in "generating" state
  const [item] = await deps.db
    .insert(contentItems)
    .values({
      verticalId,
      templateId,
      eventData: eventData as any,
      generationStatus: GENERATION_STATUS.GENERATING,
      reviewStatus: REVIEW_STATUS.DRAFT,
      aiConfig: { provider: providerName, model, templateName: template.name },
    })
    .returning({ id: contentItems.id });

  try {
    const generator = deps.contentGeneratorRegistry.resolve(providerName, { model });

    // Load trigger rule metadata for context
    let ruleName = '';
    let lookbackMinutes = 5;
    if (ruleId) {
      const [rule] = await deps.db.select().from(triggerRules).where(eq(triggerRules.id, ruleId));
      if (rule) {
        ruleName = rule.name;
        lookbackMinutes = rule.lookbackWindowMs / 60000;
      }
    }

    // Assemble context — branches on trigger type
    const isScheduled = eventData.type === 'scheduled';
    const eventDataFields = (eventData.data ?? {}) as Record<string, unknown>;

    // Common context fields shared by both scheduled and event-driven triggers
    const commonContext = {
      ruleName,
      date: new Date().toLocaleDateString(),
      category: template.category, // from content_templates — used by visual templates like tip-card
      contentLayer: template.contentLayer,
      templateName: template.name,
    };

    let context: Record<string, unknown>;
    if (isScheduled) {
      context = {
        ...commonContext,
        scheduledAt: eventDataFields.scheduledAt ?? '',
      };
    } else {
      const changePct = (eventDataFields.changePct as number) ?? 0;
      context = {
        ...eventDataFields,
        ...commonContext,
        source: eventData.source,
        type: eventData.type,
        lookbackMinutes,
        direction: changePct >= 0 ? 'up' : 'down',
        directionArrow: changePct >= 0 ? '\u25B2' : '\u25BC',
        directionClass: changePct >= 0 ? 'up' : 'down',
        changePctAbs: Math.abs(changePct).toFixed(2),
      };
    }

    const result = await generator.generate({
      promptTemplate: template.promptTemplate,
      generationConfig: genConfig,
      context,
    });

    // Filter tags against vertical's tag vocabulary
    const tagVocabulary = (defaults.tagVocabulary as string[]) ?? [];
    const validTags =
      tagVocabulary.length > 0 ? result.tags.filter(t => tagVocabulary.includes(t)) : result.tags;

    // Update content item with generated text + tags
    await deps.db
      .update(contentItems)
      .set({
        generatedText: result.text,
        tags: validTags,
        aiConfig: { provider: providerName, model: result.model, tokensUsed: result.tokensUsed },
        cost: { apiTokens: result.tokensUsed, generationTimeMs: result.durationMs },
      })
      .where(eq(contentItems.id, item.id));

    deps.logger.info(
      { contentItemId: item.id, tokens: result.tokensUsed, tags: validTags },
      'Content generated',
    );

    // Check if visual generation should be skipped
    const visualConfig = template.visualTemplate as Record<string, unknown>;
    if (visualConfig.skipVisual === true) {
      // No visual needed — transition directly to ready/pending
      await deps.db
        .update(contentItems)
        .set({ generationStatus: GENERATION_STATUS.READY, reviewStatus: REVIEW_STATUS.PENDING })
        .where(eq(contentItems.id, item.id));
      deps.logger.info({ contentItemId: item.id }, 'Skipped visual generation (skipVisual: true)');
    } else {
      // Enqueue visual generation
      // Add generatedText to context for visual template
      const visualContext = { ...context, generatedText: result.text };
      await deps.jobQueue.enqueue(JOB_TYPES.GENERATE_VISUAL, {
        contentItemId: item.id,
        templateConfig: visualConfig,
        context: visualContext,
      });
    }
  } catch (err) {
    await deps.db
      .update(contentItems)
      .set({ generationStatus: GENERATION_STATUS.FAILED })
      .where(eq(contentItems.id, item.id));
    throw err;
  }
}
