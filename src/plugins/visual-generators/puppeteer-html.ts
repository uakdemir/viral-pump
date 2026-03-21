import puppeteer from 'puppeteer';
import { readFile } from 'fs/promises';
import path from 'path';
import type { VisualGenerator, VisualGeneratorInput } from './types.js';
import { fillHtmlTemplate } from '../../shared/template-filler.js';
import { logger } from '../../shared/logger.js';

// Resolve relative to this source file, not CWD — avoids breakage when
// the process is started from a different directory (e.g., Docker WORKDIR)
const TEMPLATES_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../../templates/visuals',
);

export class PuppeteerHtmlVisualGenerator implements VisualGenerator {
  async generate(input: VisualGeneratorInput): Promise<Buffer> {
    const { templateConfig, context } = input;
    const templateName = templateConfig?.template as string;
    if (!templateName) {
      throw new Error(
        'visualTemplate.template is required but missing or empty. Set skipVisual: true to skip visual generation, or provide a template name.',
      );
    }
    const width = (templateConfig?.config as any)?.width ?? 1200;
    const height = (templateConfig?.config as any)?.height ?? 628;

    // Load template from filesystem
    const templatePath = path.join(TEMPLATES_DIR, `${templateName}.html`);
    let htmlTemplate: string;
    try {
      htmlTemplate = await readFile(templatePath, 'utf-8');
    } catch (err) {
      throw new Error(
        `Visual template not found: ${templatePath}. This is a configuration error — check content_templates.visualTemplate.template value.`,
        { cause: err },
      );
    }

    // Fill placeholders with HTML-escaped context
    const html = fillHtmlTemplate(htmlTemplate, context);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const buffer = (await page.screenshot({ type: 'png' })) as Buffer;
      return buffer;
    } finally {
      await browser.close();
    }
  }
}
