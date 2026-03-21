import { TwitterApi } from 'twitter-api-v2';
import type { PostingStrategy, PostInput, PostResult } from './types.js';
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
    if (input.text.length > MAX_TEXT_LENGTH) {
      throw new Error(
        `Tweet text exceeds ${MAX_TEXT_LENGTH} characters (got ${input.text.length})`,
      );
    }

    if (input.media) {
      if (input.media.type !== 'image' && input.media.type !== 'gif') {
        throw new Error(
          `Twitter strategy only supports image/gif media this milestone (got ${input.media.type})`,
        );
      }
      const allowedMimes = ['image/jpeg', 'image/png', 'image/gif'];
      if (input.media.mimeType && !allowedMimes.includes(input.media.mimeType)) {
        throw new Error(`Twitter only accepts JPEG/PNG/GIF (got ${input.media.mimeType})`);
      }
      if (input.media.fileSizeBytes && input.media.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
        throw new Error(
          `Media file size exceeds 5 MB limit (got ${input.media.fileSizeBytes} bytes)`,
        );
      }
    }
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
