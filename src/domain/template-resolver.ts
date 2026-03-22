import { contentTemplates } from '../shared/schema/content-templates.js';
import { TEMPLATE_SELECTION } from '../shared/constants.js';
import { validateContentConfig, type ContentConfig } from './trigger-evaluator.js';

type EnabledTemplate = typeof contentTemplates.$inferSelect;

export type TemplateResolutionResult =
  | { ok: true; selectedTemplates: EnabledTemplate[] }
  | { ok: false; reason: 'invalid-content-config' }
  | { ok: false; reason: 'missing-templates'; missingNames: string[] };

export function resolveTemplates(
  contentConfig: ContentConfig,
  enabledTemplates: EnabledTemplate[],
): TemplateResolutionResult {
  if (!validateContentConfig(contentConfig)) {
    return { ok: false, reason: 'invalid-content-config' };
  }

  const resolvedTemplates = enabledTemplates.filter(t =>
    contentConfig.templateNames.includes(t.name),
  );

  const resolvedNames = new Set(resolvedTemplates.map(t => t.name));
  const missingNames = contentConfig.templateNames.filter(n => !resolvedNames.has(n));

  if (missingNames.length > 0) {
    return { ok: false, reason: 'missing-templates', missingNames };
  }

  if (
    contentConfig.templateSelection === TEMPLATE_SELECTION.RANDOM &&
    resolvedTemplates.length > 0
  ) {
    return {
      ok: true,
      selectedTemplates: [resolvedTemplates[Math.floor(Math.random() * resolvedTemplates.length)]],
    };
  }

  return { ok: true, selectedTemplates: resolvedTemplates };
}
