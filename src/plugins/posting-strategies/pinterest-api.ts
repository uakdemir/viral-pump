import type { PostingStrategy, PostInput, PostResult } from './types.js';
import { validatePostInput } from './validation.js';
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
    validatePostInput(input, {
      platformName: 'Pinterest',
      maxTextLength: MAX_TEXT_LENGTH,
      maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
      maxFileSizeLabel: '20 MB',
      requiresMedia: true,
      allowedMediaTypes: ['image'],
      allowedMimeTypes: ['image/jpeg', 'image/png'],
    });

    // Platform-specific: boardId required
    if (!input.platformMeta?.boardId) {
      throw new Error('Pinterest requires platformMeta.boardId');
    }

    // Platform-specific: minimum width
    if (input.media && input.media.width && input.media.width < 600) {
      throw new Error(
        `Pinterest requires minimum image width of 600px (got ${input.media.width}px)`,
      );
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
