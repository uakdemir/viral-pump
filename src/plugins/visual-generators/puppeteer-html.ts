import puppeteer from 'puppeteer';
import type { VisualGenerator, VisualGeneratorInput } from './types.js';

export class PuppeteerHtmlVisualGenerator implements VisualGenerator {
  async generate(input: VisualGeneratorInput): Promise<Buffer> {
    const { generatedText, eventData, templateConfig } = input;
    const width = (templateConfig?.width as number) ?? 1200;
    const height = (templateConfig?.height as number) ?? 628;

    const html = this.renderPriceCard(generatedText, eventData, width, height);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const screenshot = await page.screenshot({ type: 'png' });
      return Buffer.from(screenshot);
    } finally {
      await browser.close();
    }
  }

  private renderPriceCard(
    text: string, eventData: Record<string, unknown>,
    width: number, height: number,
  ): string {
    const instrument = String(eventData.instrument ?? '');
    const price = String(eventData.price ?? '');
    const changePct = Number(eventData.changePct ?? 0);
    const color = changePct >= 0 ? '#22c55e' : '#ef4444';
    const arrow = changePct >= 0 ? '\u25B2' : '\u25BC';

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${width}px; height: ${height}px;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #f1f5f9; display: flex; flex-direction: column;
    justify-content: center; padding: 48px 64px;
  }
  .instrument { font-size: 24px; color: #94a3b8; margin-bottom: 12px; }
  .price-row { display: flex; align-items: baseline; gap: 16px; margin-bottom: 24px; }
  .price { font-size: 56px; font-weight: 700; }
  .change { font-size: 28px; font-weight: 600; color: ${color}; }
  .text { font-size: 22px; line-height: 1.5; color: #cbd5e1; max-width: 90%; }
  .footer { margin-top: auto; font-size: 14px; color: #475569; }
</style></head><body>
  <div class="instrument">${instrument}</div>
  <div class="price-row">
    <span class="price">$${price}</span>
    <span class="change">${arrow} ${Math.abs(changePct).toFixed(2)}%</span>
  </div>
  <div class="text">${text}</div>
  <div class="footer">ViralEngine</div>
</body></html>`;
  }
}
