import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type { PostingStrategy, PostInput, PostResult } from './types.js';
import { logger } from '../../shared/logger.js';

interface DryRunConfig {
  outputDir?: string;
}

export class DryRunPostingStrategy implements PostingStrategy {
  private outputDir: string;

  constructor(config: DryRunConfig = {}) {
    this.outputDir = config.outputDir ?? './assets/dry-run';
  }

  validateInput(_input: PostInput): void {}

  async post(input: PostInput): Promise<PostResult> {
    await mkdir(this.outputDir, { recursive: true });

    const fakeId = `dry-run-${randomUUID().slice(0, 8)}`;
    const postedAt = new Date();

    const record = {
      fakePostId: fakeId,
      postedAt: postedAt.toISOString(),
      text: input.text,
      media: input.media ?? null,
      charCount: input.text.length,
    };

    const filepath = path.join(this.outputDir, `${fakeId}.json`);
    await writeFile(filepath, JSON.stringify(record, null, 2));

    logger.info(
      {
        fakePostId: fakeId,
        charCount: input.text.length,
        hasMedia: !!input.media,
        savedTo: filepath,
      },
      '[DRY-RUN] Would have posted',
    );

    return {
      platformPostId: fakeId,
      postedAt,
    };
  }
}
