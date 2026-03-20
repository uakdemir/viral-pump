import type { PostingStrategy, PostInput, PostResult } from './types.js';
import { logger } from '../../shared/logger.js';

interface BlogStubConfig {
  baseUrl?: string;
  apiKey?: string;
}

export class BlogStubPostingStrategy implements PostingStrategy {
  constructor(_config: BlogStubConfig = {}) {}

  validateInput(input: PostInput): void {
    if (!input.platformMeta?.slug) {
      throw new Error('Blog requires platformMeta.slug');
    }

    if (!input.platformMeta?.title) {
      throw new Error('Blog requires platformMeta.title');
    }
  }

  async post(_input: PostInput): Promise<PostResult> {
    logger.warn('[Blog] Stub called — long-form HTML content pipeline not yet available');
    throw new Error('Blog posting not yet implemented. Requires long-form HTML content pipeline.');
  }
}
