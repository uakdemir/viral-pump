import { describe, it, expect } from 'vitest';
import { TwitterApiPostingStrategy } from '../../../src/plugins/posting-strategies/twitter-api.js';
import { InstagramApiPostingStrategy } from '../../../src/plugins/posting-strategies/instagram-api.js';
import { LinkedInApiPostingStrategy } from '../../../src/plugins/posting-strategies/linkedin-api.js';
import { PinterestApiPostingStrategy } from '../../../src/plugins/posting-strategies/pinterest-api.js';
import { TelegramApiPostingStrategy } from '../../../src/plugins/posting-strategies/telegram-api.js';
import { NewsletterStubPostingStrategy } from '../../../src/plugins/posting-strategies/newsletter-stub.js';
import { TikTokStubPostingStrategy } from '../../../src/plugins/posting-strategies/tiktok-stub.js';
import { YouTubeStubPostingStrategy } from '../../../src/plugins/posting-strategies/youtube-stub.js';
import { RedditStubPostingStrategy } from '../../../src/plugins/posting-strategies/reddit-stub.js';
import { BlogStubPostingStrategy } from '../../../src/plugins/posting-strategies/blog-stub.js';
import { DryRunPostingStrategy } from '../../../src/plugins/posting-strategies/dry-run.js';

// All strategies must construct with empty config (credential-lenient)
describe('Credential-lenient constructors', () => {
  it('Twitter constructs with empty config', () => {
    expect(() => new TwitterApiPostingStrategy({})).not.toThrow();
  });
  it('Instagram constructs with empty config', () => {
    expect(() => new InstagramApiPostingStrategy({})).not.toThrow();
  });
  it('LinkedIn constructs with empty config', () => {
    expect(() => new LinkedInApiPostingStrategy({})).not.toThrow();
  });
  it('Pinterest constructs with empty config', () => {
    expect(() => new PinterestApiPostingStrategy({})).not.toThrow();
  });
  it('Telegram constructs with empty config', () => {
    expect(() => new TelegramApiPostingStrategy({})).not.toThrow();
  });
  it('Newsletter constructs with empty config', () => {
    expect(() => new NewsletterStubPostingStrategy({})).not.toThrow();
  });
});

const imageMedia = {
  type: 'image' as const,
  path: '/test.png',
  mimeType: 'image/png',
  fileSizeBytes: 1000,
};
const videoMedia = { type: 'video' as const, path: '/test.mp4', mimeType: 'video/mp4' };

describe('Twitter validateInput', () => {
  const s = new TwitterApiPostingStrategy({});
  it('accepts short text', () => expect(() => s.validateInput({ text: 'Hello' })).not.toThrow());
  it('rejects text over 280', () =>
    expect(() => s.validateInput({ text: 'a'.repeat(281) })).toThrow(/280/));
  it('accepts image media', () =>
    expect(() => s.validateInput({ text: 'T', media: imageMedia })).not.toThrow());
  it('rejects video media', () =>
    expect(() => s.validateInput({ text: 'T', media: videoMedia })).toThrow(/video/i));
  it('rejects oversized image', () =>
    expect(() =>
      s.validateInput({ text: 'T', media: { ...imageMedia, fileSizeBytes: 6 * 1024 * 1024 } }),
    ).toThrow(/5MB|5 MB/));
});

describe('Instagram validateInput', () => {
  const s = new InstagramApiPostingStrategy({});
  it('rejects text-only (requires media)', () =>
    expect(() => s.validateInput({ text: 'Hello' })).toThrow(/media/i));
  it('accepts image + caption', () =>
    expect(() => s.validateInput({ text: 'Caption', media: imageMedia })).not.toThrow());
  it('rejects text over 2200', () =>
    expect(() => s.validateInput({ text: 'a'.repeat(2201), media: imageMedia })).toThrow(/2200/));
  it('rejects video (this milestone)', () =>
    expect(() => s.validateInput({ text: 'T', media: videoMedia })).toThrow(/image/i));
  it('rejects oversized image', () =>
    expect(() =>
      s.validateInput({ text: 'T', media: { ...imageMedia, fileSizeBytes: 9 * 1024 * 1024 } }),
    ).toThrow(/8MB|8 MB/));
});

describe('LinkedIn validateInput', () => {
  const s = new LinkedInApiPostingStrategy({});
  it('accepts text-only', () => expect(() => s.validateInput({ text: 'Hello' })).not.toThrow());
  it('accepts text + image', () =>
    expect(() => s.validateInput({ text: 'T', media: imageMedia })).not.toThrow());
  it('rejects text over 3000', () =>
    expect(() => s.validateInput({ text: 'a'.repeat(3001) })).toThrow(/3000/));
  it('rejects video (this milestone)', () =>
    expect(() => s.validateInput({ text: 'T', media: videoMedia })).toThrow(/image/i));
});

describe('Pinterest validateInput', () => {
  const s = new PinterestApiPostingStrategy({});
  const meta = { boardId: 'board-123' };
  it('rejects without media', () =>
    expect(() => s.validateInput({ text: 'T', platformMeta: meta })).toThrow(/media/i));
  it('rejects without boardId', () =>
    expect(() => s.validateInput({ text: 'T', media: imageMedia })).toThrow(/boardId/i));
  it('accepts image + boardId', () =>
    expect(() =>
      s.validateInput({ text: 'T', media: imageMedia, platformMeta: meta }),
    ).not.toThrow());
  it('rejects text over 500', () =>
    expect(() =>
      s.validateInput({ text: 'a'.repeat(501), media: imageMedia, platformMeta: meta }),
    ).toThrow(/500/));
});

describe('Telegram validateInput', () => {
  const s = new TelegramApiPostingStrategy({});
  it('accepts text-only', () => expect(() => s.validateInput({ text: 'Hello' })).not.toThrow());
  it('accepts text + image', () =>
    expect(() => s.validateInput({ text: 'T', media: imageMedia })).not.toThrow());
  it('rejects text over 4096', () =>
    expect(() => s.validateInput({ text: 'a'.repeat(4097) })).toThrow(/4096/));
});

describe('Newsletter validateInput', () => {
  const s = new NewsletterStubPostingStrategy({});
  it('rejects without subject', () =>
    expect(() => s.validateInput({ text: 'T' })).toThrow(/subject/i));
  it('accepts with subject', () =>
    expect(() =>
      s.validateInput({ text: 'T', platformMeta: { subject: 'Weekly' } }),
    ).not.toThrow());
});

describe('TikTok stub validateInput', () => {
  const s = new TikTokStubPostingStrategy({});
  it('rejects non-video', () =>
    expect(() => s.validateInput({ text: 'T', media: imageMedia })).toThrow(/video/i));
  it('rejects missing media', () => expect(() => s.validateInput({ text: 'T' })).toThrow(/video/i));
  it('accepts video/mp4', () =>
    expect(() => s.validateInput({ text: 'T', media: videoMedia })).not.toThrow());
});

describe('YouTube stub validateInput', () => {
  const s = new YouTubeStubPostingStrategy({});
  it('rejects non-video', () =>
    expect(() => s.validateInput({ text: 'T', media: imageMedia })).toThrow(/video/i));
  it('accepts video', () =>
    expect(() => s.validateInput({ text: 'T', media: videoMedia })).not.toThrow());
});

describe('Reddit stub validateInput', () => {
  const s = new RedditStubPostingStrategy({});
  it('rejects without subreddit', () =>
    expect(() => s.validateInput({ text: 'T', platformMeta: { title: 'x' } })).toThrow(
      /subreddit/i,
    ));
  it('rejects without title', () =>
    expect(() => s.validateInput({ text: 'T', platformMeta: { subreddit: 'r/test' } })).toThrow(
      /title/i,
    ));
  it('accepts with both', () =>
    expect(() =>
      s.validateInput({ text: 'T', platformMeta: { subreddit: 'r/test', title: 'Test' } }),
    ).not.toThrow());
});

describe('Blog stub validateInput', () => {
  const s = new BlogStubPostingStrategy({});
  it('rejects without slug', () =>
    expect(() => s.validateInput({ text: 'T', platformMeta: { title: 'x' } })).toThrow(/slug/i));
  it('rejects without title', () =>
    expect(() => s.validateInput({ text: 'T', platformMeta: { slug: 'x' } })).toThrow(/title/i));
  it('accepts with both', () =>
    expect(() =>
      s.validateInput({ text: 'T', platformMeta: { slug: 'test', title: 'Test' } }),
    ).not.toThrow());
});

describe('Dry-run validateInput', () => {
  const s = new DryRunPostingStrategy();
  it('accepts anything', () => expect(() => s.validateInput({ text: '' })).not.toThrow());
});
