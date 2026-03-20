import type { PostingStrategy, PostInput, PostResult } from './types.js';
import { logger } from '../../shared/logger.js';

interface TikTokStubConfig {
  accessToken?: string;
}

export class TikTokStubPostingStrategy implements PostingStrategy {
  constructor(_config: TikTokStubConfig = {}) {}

  validateInput(input: PostInput): void {
    if (!input.media) {
      throw new Error('TikTok requires video media');
    }

    if (input.media.type !== 'video') {
      throw new Error(`TikTok requires media.type === 'video' (got ${input.media.type})`);
    }

    if (input.media.mimeType !== 'video/mp4') {
      throw new Error(`TikTok requires mimeType === 'video/mp4' (got ${input.media.mimeType})`);
    }

    // 9:16 aspect ratio check
    if (input.media.width && input.media.height) {
      const ratio = input.media.width / input.media.height;
      const expected = 9 / 16;
      if (Math.abs(ratio - expected) / expected > 0.05) {
        throw new Error(`TikTok requires 9:16 aspect ratio (got ${ratio.toFixed(2)})`);
      }
    }
  }

  async post(_input: PostInput): Promise<PostResult> {
    logger.warn('[TikTok] Stub called — video pipeline not yet available');
    throw new Error('TikTok posting not yet implemented. Requires video generation pipeline.');
  }
}
