import type { PostingStrategy, PostInput, PostResult } from './types.js';
import { logger } from '../../shared/logger.js';

interface PinterestApiConfig {
  accessToken?: string;
}

const MAX_TEXT_LENGTH = 500;
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export class PinterestApiPostingStrategy implements PostingStrategy {
  private accessToken: string | undefined;

  constructor(config: PinterestApiConfig = {}) {
    this.accessToken = config.accessToken;
  }

  validateInput(input: PostInput): void {
    if (input.text.length > MAX_TEXT_LENGTH) {
      throw new Error(
        `Pinterest description exceeds ${MAX_TEXT_LENGTH} characters (got ${input.text.length})`,
      );
    }

    if (!input.media) {
      throw new Error('Pinterest requires media (image)');
    }

    if (input.media.type !== 'image') {
      throw new Error(`Pinterest strategy only supports image media (got ${input.media.type})`);
    }

    const allowedMimes = ['image/jpeg', 'image/png'];
    if (input.media.mimeType && !allowedMimes.includes(input.media.mimeType)) {
      throw new Error(`Pinterest only accepts JPEG/PNG (got ${input.media.mimeType})`);
    }

    if (!input.platformMeta?.boardId) {
      throw new Error('Pinterest requires platformMeta.boardId');
    }

    if (input.media.fileSizeBytes && input.media.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `Media file size exceeds 20 MB limit (got ${input.media.fileSizeBytes} bytes)`,
      );
    }

    if (input.media.width && input.media.width < 600) {
      throw new Error(`Pinterest requires image width >= 600px (got ${input.media.width}px)`);
    }
  }

  async post(input: PostInput): Promise<PostResult> {
    if (!this.accessToken) {
      throw new Error('Pinterest credentials not configured');
    }

    const boardId = input.platformMeta!.boardId as string;
    const imageUrl = input.media!.publicUrl ?? input.media!.path;
    if (!imageUrl.startsWith('http')) {
      throw new Error(
        'Pinterest requires a publicly reachable image URL. Configure AssetStore with a public base URL or use S3/CDN.',
      );
    }

    logger.info({ boardId }, '[Pinterest] Creating Pin');

    const pinPayload = {
      board_id: boardId,
      media_source: {
        source_type: 'image_url',
        url: imageUrl,
      },
      description: input.text,
      alt_text: input.media!.altText ?? '',
      ...(input.platformMeta?.title ? { title: String(input.platformMeta.title) } : {}),
      ...(input.platformMeta?.link ? { link: String(input.platformMeta.link) } : {}),
    };

    const res = await fetch('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pinPayload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Pinterest Pin creation failed: ${err}`);
    }

    const data = (await res.json()) as { id: string };

    logger.info({ pinId: data.id }, '[Pinterest] Pin created');

    return {
      platformPostId: data.id,
      postedAt: new Date(),
      url: `https://www.pinterest.com/pin/${data.id}/`,
    };
  }
}
