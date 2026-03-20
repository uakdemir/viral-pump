import type { PostingStrategy, PostInput, PostResult } from './types.js';
import { logger } from '../../shared/logger.js';

interface YouTubeStubConfig {
  accessToken?: string;
}

export class YouTubeStubPostingStrategy implements PostingStrategy {
  constructor(_config: YouTubeStubConfig = {}) {}

  validateInput(input: PostInput): void {
    if (!input.media) {
      throw new Error('YouTube requires video media');
    }

    if (input.media.type !== 'video') {
      throw new Error(`YouTube requires media.type === 'video' (got ${input.media.type})`);
    }
  }

  async post(_input: PostInput): Promise<PostResult> {
    logger.warn('[YouTube] Stub called — video pipeline not yet available');
    throw new Error('YouTube posting not yet implemented. Requires video generation pipeline.');
  }
}
