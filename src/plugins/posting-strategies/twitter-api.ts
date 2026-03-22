import { TwitterApi } from 'twitter-api-v2';
import type { PostingStrategy, PostInput, PostResult } from './types.js';
import { validatePostInput } from './validation.js';
import { logger } from '../../shared/logger.js';

interface TwitterApiConfig {
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  accessTokenSecret?: string;
}

const MAX_TEXT_LENGTH = 280;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export class TwitterApiPostingStrategy implements PostingStrategy {
  private config: TwitterApiConfig;
  private client: TwitterApi | null = null;

  constructor(config: TwitterApiConfig = {}) {
    this.config = config;
  }

  private getClient(): TwitterApi {
    if (!this.client) {
      if (
        !this.config.apiKey ||
        !this.config.apiSecret ||
        !this.config.accessToken ||
        !this.config.accessTokenSecret
      ) {
        throw new Error('Twitter credentials not configured');
      }
      this.client = new TwitterApi({
        appKey: this.config.apiKey,
        appSecret: this.config.apiSecret,
        accessToken: this.config.accessToken,
        accessSecret: this.config.accessTokenSecret,
      });
    }
    return this.client;
  }

  validateInput(input: PostInput): void {
    validatePostInput(input, {
      platformName: 'Twitter',
      maxTextLength: MAX_TEXT_LENGTH,
      maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
      maxFileSizeLabel: '5 MB',
      allowedMediaTypes: ['image', 'gif'],
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif'],
    });
  }

  async post(input: PostInput): Promise<PostResult> {
    const client = this.getClient();

    let mediaId: string | undefined;
    if (input.media?.path) {
      logger.info({ path: input.media.path }, '[Twitter] Uploading media');
      mediaId = await client.v1.uploadMedia(input.media.path);
    }

    const tweetPayload: any = { text: input.text };
    if (mediaId) {
      tweetPayload.media = { media_ids: [mediaId] };
    }

    const result = await client.v2.tweet(tweetPayload);

    logger.info({ postId: result.data.id }, '[Twitter] Tweet posted');

    return {
      platformPostId: result.data.id,
      postedAt: new Date(),
      url: `https://twitter.com/i/status/${result.data.id}`,
    };
  }
}
