import { describe, it, expect } from 'vitest';
import { validatePostInput } from '../../../src/plugins/posting-strategies/validation.js';
import type { PostInput } from '../../../src/plugins/posting-strategies/types.js';

describe('validatePostInput', () => {
  const baseInput: PostInput = {
    text: 'Hello world',
    media: {
      type: 'image',
      path: '/test.png',
      mimeType: 'image/png',
      fileSizeBytes: 1000,
    },
  };

  it('passes with valid input within constraints', () => {
    expect(() =>
      validatePostInput(baseInput, {
        platformName: 'TestPlatform',
        maxTextLength: 280,
      }),
    ).not.toThrow();
  });

  it('throws when text exceeds maxTextLength', () => {
    const input = { ...baseInput, text: 'a'.repeat(300) };
    expect(() =>
      validatePostInput(input, {
        platformName: 'TestPlatform',
        maxTextLength: 280,
      }),
    ).toThrow('TestPlatform text exceeds 280 characters');
  });

  it('throws when media type is not in allowedMediaTypes', () => {
    const input = { ...baseInput, media: { ...baseInput.media!, type: 'video' as const } };
    expect(() =>
      validatePostInput(input, {
        platformName: 'TestPlatform',
        maxTextLength: 280,
        allowedMediaTypes: ['image'],
      }),
    ).toThrow('TestPlatform does not support video media');
  });

  it('throws when MIME type is not in allowedMimeTypes', () => {
    const input = { ...baseInput, media: { ...baseInput.media!, mimeType: 'image/webp' } };
    expect(() =>
      validatePostInput(input, {
        platformName: 'TestPlatform',
        maxTextLength: 280,
        allowedMimeTypes: ['image/jpeg', 'image/png'],
      }),
    ).toThrow('TestPlatform does not accept image/webp');
  });

  it('throws when file size exceeds maxFileSizeBytes', () => {
    const input = { ...baseInput, media: { ...baseInput.media!, fileSizeBytes: 10_000_000 } };
    expect(() =>
      validatePostInput(input, {
        platformName: 'TestPlatform',
        maxTextLength: 280,
        maxFileSizeBytes: 5_000_000,
        maxFileSizeLabel: '5 MB',
      }),
    ).toThrow('5 MB limit');
  });

  it('throws when requiresMedia is true and no media provided', () => {
    const input = { text: 'Hello world' };
    expect(() =>
      validatePostInput(input, {
        platformName: 'Instagram',
        maxTextLength: 2200,
        requiresMedia: true,
      }),
    ).toThrow('Instagram requires media');
  });

  it('passes when requiresMedia is false and no media provided', () => {
    const input = { text: 'Hello world' };
    expect(() =>
      validatePostInput(input, {
        platformName: 'Twitter',
        maxTextLength: 280,
        requiresMedia: false,
      }),
    ).not.toThrow();
  });

  it('still validates media constraints when requiresMedia is false but media is present', () => {
    const input = { ...baseInput, media: { ...baseInput.media!, type: 'video' as const } };
    expect(() =>
      validatePostInput(input, {
        platformName: 'Twitter',
        maxTextLength: 280,
        requiresMedia: false,
        allowedMediaTypes: ['image', 'gif'],
      }),
    ).toThrow('Twitter does not support video media');
  });
});
