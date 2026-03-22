import type { PostInput, MediaInput } from './types.js';

export interface PlatformConstraints {
  platformName: string;
  maxTextLength: number;
  maxFileSizeBytes?: number;
  maxFileSizeLabel?: string;
  allowedMediaTypes?: MediaInput['type'][];
  allowedMimeTypes?: string[];
  requiresMedia?: boolean;
}

export function validatePostInput(input: PostInput, constraints: PlatformConstraints): void {
  if (input.text.length > constraints.maxTextLength) {
    throw new Error(
      `${constraints.platformName} text exceeds ${constraints.maxTextLength} characters (got ${input.text.length})`,
    );
  }

  if (constraints.requiresMedia && !input.media) {
    throw new Error(`${constraints.platformName} requires media`);
  }

  if (input.media) {
    if (
      constraints.allowedMediaTypes &&
      !constraints.allowedMediaTypes.includes(input.media.type)
    ) {
      throw new Error(
        `${constraints.platformName} does not support ${input.media.type} media (allowed: ${constraints.allowedMediaTypes.join(', ')})`,
      );
    }

    if (
      constraints.allowedMimeTypes &&
      !constraints.allowedMimeTypes.includes(input.media.mimeType)
    ) {
      throw new Error(
        `${constraints.platformName} does not accept ${input.media.mimeType} (allowed: ${constraints.allowedMimeTypes.join(', ')})`,
      );
    }

    if (
      constraints.maxFileSizeBytes &&
      input.media.fileSizeBytes &&
      input.media.fileSizeBytes > constraints.maxFileSizeBytes
    ) {
      const label = constraints.maxFileSizeLabel ?? `${constraints.maxFileSizeBytes} bytes`;
      throw new Error(
        `Media file size exceeds ${label} limit (got ${input.media.fileSizeBytes} bytes)`,
      );
    }
  }
}
