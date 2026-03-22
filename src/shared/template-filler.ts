import { htmlEscape } from './html.js';

function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current != null && typeof current === 'object') {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function fill(template: string, context: Record<string, unknown>, escapeHtml: boolean): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
    const value = resolvePath(context, path);
    if (value == null) return '';
    const str = String(value);
    return escapeHtml ? htmlEscape(str) : str;
  });
}

export function fillPromptTemplate(template: string, context: Record<string, unknown>): string {
  return fill(template, context, false);
}

export function fillHtmlTemplate(template: string, context: Record<string, unknown>): string {
  return fill(template, context, true);
}
