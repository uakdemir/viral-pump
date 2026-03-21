import { describe, it, expect } from 'vitest';
import { getContentMediaType, isCompatible } from '../../src/shared/platform-compatibility.js';

describe('platform-compatibility', () => {
  it('twitter accepts image', () => expect(isCompatible('twitter', 'image')).toBe(true));
  it('twitter accepts text-only', () => expect(isCompatible('twitter', 'text-only')).toBe(true));
  it('instagram rejects text-only', () =>
    expect(isCompatible('instagram', 'text-only')).toBe(false));
  it('instagram accepts image', () => expect(isCompatible('instagram', 'image')).toBe(true));
  it('tiktok only accepts video', () => {
    expect(isCompatible('tiktok', 'video')).toBe(true);
    expect(isCompatible('tiktok', 'image')).toBe(false);
  });
  it('pinterest rejects text-only', () =>
    expect(isCompatible('pinterest', 'text-only')).toBe(false));
  it('reddit only accepts long-form', () => {
    expect(isCompatible('reddit', 'long-form')).toBe(true);
    expect(isCompatible('reddit', 'image')).toBe(false);
  });
  it('unknown platform is incompatible', () =>
    expect(isCompatible('unknown', 'image')).toBe(false));
  it('getContentMediaType returns text-only for null', () =>
    expect(getContentMediaType(null)).toBe('text-only'));
  it('getContentMediaType returns image for url', () =>
    expect(getContentMediaType('/assets/123.png')).toBe('image'));
});
