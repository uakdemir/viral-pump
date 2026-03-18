import { TwitterApi } from 'twitter-api-v2';
import type { PostingStrategy, PostInput, PostResult } from './types.js';

interface TwitterApiConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

export class TwitterApiPostingStrategy implements PostingStrategy {
  private client: TwitterApi;

  constructor(config: TwitterApiConfig) {
    this.client = new TwitterApi({
      appKey: config.apiKey,
      appSecret: config.apiSecret,
      accessToken: config.accessToken,
      accessSecret: config.accessTokenSecret,
    });
  }

  async post(input: PostInput): Promise<PostResult> {
    let mediaId: string | undefined;
    if (input.imagePath) {
      mediaId = await this.client.v1.uploadMedia(input.imagePath);
    }

    const tweetPayload: any = { text: input.text };
    if (mediaId) {
      tweetPayload.media = { media_ids: [mediaId] };
    }

    const result = await this.client.v2.tweet(tweetPayload);

    return {
      platformPostId: result.data.id,
      postedAt: new Date(),
    };
  }
}
