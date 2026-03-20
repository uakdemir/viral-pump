import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type { PostingStrategy, PostInput, PostResult } from './types.js';
import { logger } from '../../shared/logger.js';

interface NewsletterStubConfig {
  outputDir?: string;
}

export class NewsletterStubPostingStrategy implements PostingStrategy {
  private outputDir: string;

  constructor(config: NewsletterStubConfig = {}) {
    this.outputDir = config.outputDir ?? './assets/newsletters';
  }

  validateInput(input: PostInput): void {
    if (!input.platformMeta?.subject) {
      throw new Error('Newsletter requires platformMeta.subject');
    }
  }

  async post(input: PostInput): Promise<PostResult> {
    await mkdir(this.outputDir, { recursive: true });

    const fakeId = `newsletter-${randomUUID().slice(0, 8)}`;
    const subject = input.platformMeta!.subject as string;

    const imageTag = input.media?.path
      ? `<img src="${input.media.path}" alt="${input.media.altText ?? ''}" style="max-width:100%;height:auto;" />`
      : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; }
    h1 { font-size: 24px; }
    .content { line-height: 1.6; }
    img { border-radius: 8px; margin: 16px 0; }
  </style>
</head>
<body>
  <h1>${subject}</h1>
  ${imageTag}
  <div class="content">
    ${input.text.split('\n').map(p => `<p>${p}</p>`).join('\n    ')}
  </div>
</body>
</html>`;

    const filepath = path.join(this.outputDir, `${fakeId}.html`);
    await writeFile(filepath, html);

    logger.info({
      fakeId,
      subject,
      savedTo: filepath,
    }, '[Newsletter] Generated newsletter HTML');

    return {
      platformPostId: fakeId,
      postedAt: new Date(),
      url: filepath,
    };
  }
}
