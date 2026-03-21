export type MediaType = 'image' | 'video' | 'text-only' | 'long-form';

export const COMPATIBLE_PLATFORMS: Record<string, Set<MediaType>> = {
  twitter: new Set(['image', 'text-only']),
  instagram: new Set(['image']),
  linkedin: new Set(['image', 'text-only']),
  pinterest: new Set(['image']),
  telegram: new Set(['image', 'text-only']),
  newsletter: new Set(['image', 'text-only']),
  tiktok: new Set(['video']),
  youtube: new Set(['video']),
  reddit: new Set(['long-form']),
  blog: new Set(['long-form']),
};

export function getContentMediaType(visualUrl: string | null): MediaType {
  if (!visualUrl) return 'text-only';
  return 'image';
}

export function isCompatible(platform: string, mediaType: MediaType): boolean {
  return COMPATIBLE_PLATFORMS[platform]?.has(mediaType) ?? false;
}
