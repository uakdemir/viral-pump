import type { PostingStrategy, PostInput, PostResult } from './types.js';
import { validatePostInput } from './validation.js';
import { logger } from '../../shared/logger.js';

interface InstagramApiConfig {
  accessToken?: string;
  instagramBusinessAccountId?: string;
}

const MAX_TEXT_LENGTH = 2200;
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

export class InstagramApiPostingStrategy implements PostingStrategy {
  private accessToken: string | undefined;
  private instagramBusinessAccountId: string | undefined;

  constructor(config: InstagramApiConfig = {}) {
    this.accessToken = config.accessToken;
    this.instagramBusinessAccountId = config.instagramBusinessAccountId;
  }

  validateInput(input: PostInput): void {
    validatePostInput(input, {
      platformName: 'Instagram',
      maxTextLength: MAX_TEXT_LENGTH,
      maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
      maxFileSizeLabel: '8 MB',
      requiresMedia: true,
      allowedMediaTypes: ['image'],
      allowedMimeTypes: ['image/jpeg', 'image/png'],
    });

    // Platform-specific: aspect ratio check
    if (input.media && input.media.width && input.media.height) {
      const ratio = input.media.width / input.media.height;
      const validRatios = [1, 4 / 5, 16 / 9];
      const isValid = validRatios.some(r => Math.abs(ratio - r) / r < 0.05);
      if (!isValid) {
        throw new Error(
          `Instagram requires 1:1, 4:5, or 16:9 aspect ratio (got ${ratio.toFixed(2)})`,
        );
      }
    }
  }

  async post(input: PostInput): Promise<PostResult> {
    if (!this.accessToken || !this.instagramBusinessAccountId) {
      throw new Error('Instagram credentials not configured');
    }

    const imageUrl = input.media!.publicUrl ?? input.media!.path;
    if (!imageUrl.startsWith('http')) {
      throw new Error(
        'Instagram requires a publicly reachable image URL. Configure AssetStore with a public base URL or use S3/CDN.',
      );
    }

    // Step 1: Create media container
    logger.info(
      { accountId: this.instagramBusinessAccountId },
      '[Instagram] Creating media container',
    );

    const containerRes = await fetch(
      `https://graph.facebook.com/v19.0/${this.instagramBusinessAccountId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrl,
          caption: input.text,
          access_token: this.accessToken,
        }),
      },
    );

    if (!containerRes.ok) {
      const err = await containerRes.text();
      throw new Error(`Instagram container creation failed: ${err}`);
    }

    const containerData = (await containerRes.json()) as { id: string };
    const containerId = containerData.id;

    // Step 2: Publish the container
    logger.info({ containerId }, '[Instagram] Publishing container');

    const publishRes = await fetch(
      `https://graph.facebook.com/v19.0/${this.instagramBusinessAccountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: this.accessToken,
        }),
      },
    );

    if (!publishRes.ok) {
      const err = await publishRes.text();
      throw new Error(`Instagram publish failed: ${err}`);
    }

    const publishData = (await publishRes.json()) as { id: string };

    logger.info({ postId: publishData.id }, '[Instagram] Post published');

    // Fetch permalink for the published media
    let url: string | undefined;
    try {
      const permalinkRes = await fetch(
        `https://graph.facebook.com/v19.0/${publishData.id}?fields=permalink&access_token=${this.accessToken}`,
      );
      if (permalinkRes.ok) {
        const permalinkData = (await permalinkRes.json()) as { permalink?: string };
        url = permalinkData.permalink;
      }
    } catch {
      // Non-fatal — permalink is nice-to-have, post already succeeded
    }

    return {
      platformPostId: publishData.id,
      postedAt: new Date(),
      url,
    };
  }
}
