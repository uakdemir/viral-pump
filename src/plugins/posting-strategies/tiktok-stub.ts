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
  }

  async post(_input: PostInput): Promise<PostResult> {
    logger.warn('[TikTok] Stub called — video pipeline not yet available');
    throw new Error('TikTok posting not yet implemented. Requires video generation pipeline.');
  }
}
