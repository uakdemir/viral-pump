import type { PostingStrategy, PostInput, PostResult } from './types.js';
import { logger } from '../../shared/logger.js';

interface RedditStubConfig {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}

export class RedditStubPostingStrategy implements PostingStrategy {
  constructor(_config: RedditStubConfig = {}) {}

  validateInput(input: PostInput): void {
    if (!input.platformMeta?.subreddit) {
      throw new Error('Reddit requires platformMeta.subreddit');
    }

    if (!input.platformMeta?.title) {
      throw new Error('Reddit requires platformMeta.title');
    }
  }

  async post(_input: PostInput): Promise<PostResult> {
    logger.warn('[Reddit] Stub called — long-form content pipeline not yet available');
    throw new Error('Reddit posting not yet implemented. Requires long-form content pipeline.');
  }
}
