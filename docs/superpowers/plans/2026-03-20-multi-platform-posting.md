# Multi-Platform Posting — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand posting from Twitter-only to 10 platforms (Twitter, Instagram, LinkedIn, Pinterest, Telegram, Newsletter, TikTok, YouTube, Reddit, Blog) with per-platform validation, media metadata, platform-aware routing, and dry-run-as-flag architecture.

**Architecture:** Each platform is a `PostingStrategy` plugin behind the existing factory/registry. The `PostInput` interface expands to include `MediaInput` metadata and `platformMeta`. The review workflow gains platform-aware routing via `content_templates.platform` + `COMPATIBLE_PLATFORMS` map. Dry-run is a flag on the account (`dryRun: true`), not a separate strategy — validation always runs against real platform constraints.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, twitter-api-v2 (existing), direct HTTP for Instagram/LinkedIn/Pinterest/Telegram APIs

**Spec:** `docs/superpowers/specs/2026-03-19-multi-platform-posting-design.md`

---

## File Structure

```
src/
├── shared/
│   ├── constants.ts                              # Add PLATFORMS map
│   ├── schema/
│   │   ├── posts.ts                              # Add url, failureReason columns
│   │   ├── content-items.ts                      # Add mediaMeta column
│   │   └── content-templates.ts                  # Add platformMeta column
│   └── platform-compatibility.ts                 # NEW: COMPATIBLE_PLATFORMS map
├── plugins/
│   └── posting-strategies/
│       ├── types.ts                              # Expanded PostInput, MediaInput, validateInput()
│       ├── twitter-api.ts                        # Refactor to use PostInput.media + validateInput()
│       ├── dry-run.ts                            # Add validateInput() (no-op)
│       ├── instagram-api.ts                      # NEW: Meta Graph API
│       ├── linkedin-api.ts                       # NEW: LinkedIn Marketing API
│       ├── pinterest-api.ts                      # NEW: Pinterest API v5
│       ├── telegram-api.ts                       # NEW: Telegram Bot API
│       ├── newsletter-stub.ts                    # NEW: saves HTML to file
│       ├── tiktok-stub.ts                        # NEW: validates video, throws not-implemented
│       ├── youtube-stub.ts                       # NEW: validates video, throws not-implemented
│       ├── reddit-stub.ts                        # NEW: validates long-form + subreddit
│       └── blog-stub.ts                          # NEW: validates HTML + SEO meta
├── domain/
│   └── review-workflow.ts                        # Platform-aware routing in createPostsForContent()
└── worker/
    ├── handlers/
    │   ├── post-to-platform.ts                   # Build PostInput with media + platformMeta, dryRun check, validateInput()
    │   └── generate-visual.ts                    # Persist mediaMeta after screenshot
    └── index.ts                                  # Register all new posting strategies
tests/
├── shared/
│   └── platform-compatibility.test.ts            # NEW
├── plugins/
│   └── posting-strategies/
│       ├── twitter-api.test.ts                   # NEW: validateInput tests
│       ├── instagram-api.test.ts                 # NEW
│       ├── telegram-api.test.ts                  # NEW
│       └── stubs.test.ts                         # NEW: all stubs validate correctly
└── domain/
    └── review-workflow.test.ts                    # NEW: platform routing tests
db/
└── seed.sql                                      # Multi-platform accounts + templates
```

---

## Task 1: Schema Changes + Migration

**Files:**
- Modify: `src/shared/schema/posts.ts`
- Modify: `src/shared/schema/content-items.ts`
- Modify: `src/shared/schema/content-templates.ts`

- [ ] **Step 1: Add columns to posts schema**

```typescript
// src/shared/schema/posts.ts — add after platformPostId
url: text('url'),                         // direct link to posted content
failureReason: text('failure_reason'),    // validation or API error message
```

- [ ] **Step 2: Add mediaMeta to content-items schema**

```typescript
// src/shared/schema/content-items.ts — add after visualUrl
mediaMeta: jsonb('media_meta').notNull().default({}),  // { mimeType, width, height, fileSizeBytes }
```

- [ ] **Step 3: Add platformMeta to content-templates schema**

```typescript
// src/shared/schema/content-templates.ts — add after visualTemplate
platformMeta: jsonb('platform_meta').notNull().default({}),  // per-template platform metadata
```

- [ ] **Step 4: Generate and verify migration**

```bash
npx drizzle-kit generate
```

Expected: migration with 3 ALTER TABLE ADD COLUMN + 1 new JSONB field.

- [ ] **Step 5: Run migration**

```bash
npx drizzle-kit migrate
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/schema/ drizzle/
# Commit: "feat(sp4): schema — posts.url, posts.failure_reason, content_items.media_meta, content_templates.platform_meta"
```

---

## Task 2: Expanded PostInput Interface + Platform Compatibility Map

**Files:**
- Modify: `src/plugins/posting-strategies/types.ts`
- Create: `src/shared/platform-compatibility.ts`
- Test: `tests/shared/platform-compatibility.test.ts`

- [ ] **Step 1: Rewrite types.ts with new interfaces**

```typescript
// src/plugins/posting-strategies/types.ts
export interface MediaInput {
  type: 'image' | 'video' | 'gif' | 'carousel';
  path: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
  fileSizeBytes?: number;
  altText?: string;
  additionalPaths?: string[];
}

export interface PostInput {
  text: string;
  media?: MediaInput;
  platformMeta?: Record<string, unknown>;
}

export interface PostResult {
  platformPostId: string;
  postedAt: Date;
  url?: string;
}

export interface PostingStrategy {
  validateInput(input: PostInput): void;
  post(input: PostInput): Promise<PostResult>;
}
```

- [ ] **Step 2: Create platform-compatibility.ts**

```typescript
// src/shared/platform-compatibility.ts
export type MediaType = 'image' | 'video' | 'text-only' | 'long-form';

export const COMPATIBLE_PLATFORMS: Record<string, Set<MediaType>> = {
  twitter:    new Set(['image', 'text-only']),
  instagram:  new Set(['image']),
  linkedin:   new Set(['image', 'text-only']),
  pinterest:  new Set(['image']),
  telegram:   new Set(['image', 'text-only']),
  newsletter: new Set(['image', 'text-only']),
  tiktok:     new Set(['video']),
  youtube:    new Set(['video']),
  reddit:     new Set(['long-form']),
  blog:       new Set(['long-form']),
};

export function getContentMediaType(visualUrl: string | null): MediaType {
  if (!visualUrl) return 'text-only';
  return 'image'; // future: detect video from mediaMeta.mimeType
}

export function isCompatible(platform: string, mediaType: MediaType): boolean {
  return COMPATIBLE_PLATFORMS[platform]?.has(mediaType) ?? false;
}
```

- [ ] **Step 3: Write tests for platform compatibility**

```typescript
// tests/shared/platform-compatibility.test.ts
import { describe, it, expect } from 'vitest';
import { getContentMediaType, isCompatible } from '../../src/shared/platform-compatibility.js';

describe('platform-compatibility', () => {
  it('twitter accepts image', () => {
    expect(isCompatible('twitter', 'image')).toBe(true);
  });
  it('twitter accepts text-only', () => {
    expect(isCompatible('twitter', 'text-only')).toBe(true);
  });
  it('instagram rejects text-only', () => {
    expect(isCompatible('instagram', 'text-only')).toBe(false);
  });
  it('tiktok only accepts video', () => {
    expect(isCompatible('tiktok', 'video')).toBe(true);
    expect(isCompatible('tiktok', 'image')).toBe(false);
  });
  it('getContentMediaType returns text-only for null', () => {
    expect(getContentMediaType(null)).toBe('text-only');
  });
  it('getContentMediaType returns image for url', () => {
    expect(getContentMediaType('/assets/123.png')).toBe('image');
  });
  it('unknown platform is incompatible', () => {
    expect(isCompatible('unknown', 'image')).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/shared/platform-compatibility.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/plugins/posting-strategies/types.ts src/shared/platform-compatibility.ts tests/shared/platform-compatibility.test.ts
# Commit: "feat(sp4): expanded PostInput interface + COMPATIBLE_PLATFORMS map"
```

---

## Task 3: Refactor Twitter + Dry-Run with validateInput()

**Files:**
- Modify: `src/plugins/posting-strategies/twitter-api.ts`
- Modify: `src/plugins/posting-strategies/dry-run.ts`
- Test: `tests/plugins/posting-strategies/twitter-api.test.ts`

- [ ] **Step 1: Write Twitter validateInput tests**

```typescript
// tests/plugins/posting-strategies/twitter-api.test.ts
import { describe, it, expect } from 'vitest';
import { TwitterApiPostingStrategy } from '../../../src/plugins/posting-strategies/twitter-api.js';

describe('TwitterApiPostingStrategy.validateInput', () => {
  const strategy = new TwitterApiPostingStrategy({
    apiKey: 'test', apiSecret: 'test', accessToken: 'test', accessTokenSecret: 'test',
  });

  it('accepts text within 280 chars', () => {
    expect(() => strategy.validateInput({ text: 'Hello world' })).not.toThrow();
  });

  it('rejects text over 280 chars', () => {
    expect(() => strategy.validateInput({ text: 'a'.repeat(281) })).toThrow(/280/);
  });

  it('accepts image media', () => {
    expect(() => strategy.validateInput({
      text: 'Test',
      media: { type: 'image', path: '/test.png', mimeType: 'image/png' },
    })).not.toThrow();
  });

  it('rejects video media (not supported this milestone)', () => {
    expect(() => strategy.validateInput({
      text: 'Test',
      media: { type: 'video', path: '/test.mp4', mimeType: 'video/mp4' },
    })).toThrow(/video/i);
  });
});
```

- [ ] **Step 2: Refactor twitter-api.ts**

Add `validateInput()` method. Refactor `post()` to use `PostInput.media` instead of `imagePath`:

```typescript
validateInput(input: PostInput): void {
  if (input.text.length > 280) {
    throw new Error(`Twitter text exceeds 280 characters (got ${input.text.length})`);
  }
  if (input.media && input.media.type !== 'image' && input.media.type !== 'gif') {
    throw new Error(`Twitter posting only supports image/gif media this milestone (got ${input.media.type})`);
  }
  if (input.media?.fileSizeBytes && input.media.fileSizeBytes > 5 * 1024 * 1024) {
    throw new Error(`Twitter image must be under 5MB (got ${(input.media.fileSizeBytes / 1024 / 1024).toFixed(1)}MB)`);
  }
}

async post(input: PostInput): Promise<PostResult> {
  let mediaId: string | undefined;
  if (input.media?.path) {
    mediaId = await this.client.v1.uploadMedia(input.media.path);
  }
  // ... rest same as before but using input.media instead of input.imagePath
}
```

- [ ] **Step 3: Update dry-run.ts**

Add `validateInput()` as no-op. Update `post()` to log `media` metadata:

```typescript
validateInput(_input: PostInput): void {
  // Dry-run accepts everything — real validation happens on the platform strategy
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/plugins/posting-strategies/
```

- [ ] **Step 5: Commit**

```bash
git add src/plugins/posting-strategies/twitter-api.ts src/plugins/posting-strategies/dry-run.ts tests/plugins/posting-strategies/
# Commit: "feat(sp4): twitter + dry-run refactored with validateInput() and PostInput.media"
```

---

## Task 4: Platform Posting Plugins — Tier 1

**IMPORTANT RULE:** All strategy constructors must be **credential-lenient**. Constructors accept config but MUST NOT eagerly validate credentials, initialize SDK clients, or throw on missing tokens. Auth validation happens lazily inside `post()` — not in the constructor. This allows `dryRun: true` accounts with no real credentials to resolve the strategy, run `validateInput()`, and skip `post()` without error.

**Test this explicitly:** Add a test per strategy proving construction succeeds with empty credentials, `validateInput()` runs, and only `post()` fails on missing auth.

**Files:**
- Create: `src/plugins/posting-strategies/instagram-api.ts`
- Create: `src/plugins/posting-strategies/linkedin-api.ts`
- Create: `src/plugins/posting-strategies/pinterest-api.ts`
- Create: `src/plugins/posting-strategies/telegram-api.ts`
- Create: `src/plugins/posting-strategies/newsletter-stub.ts`
- Test: `tests/plugins/posting-strategies/instagram-api.test.ts`
- Test: `tests/plugins/posting-strategies/linkedin-api.test.ts`
- Test: `tests/plugins/posting-strategies/pinterest-api.test.ts`
- Test: `tests/plugins/posting-strategies/telegram-api.test.ts`
- Test: `tests/plugins/posting-strategies/newsletter-stub.test.ts`

- [ ] **Step 1: Implement Instagram API posting strategy**

```typescript
// src/plugins/posting-strategies/instagram-api.ts
// Meta Graph API: upload image → create container → publish
// validateInput: requires media (image), text <= 2200, aspect ratio 1:1/4:5/16:9
// Auth: long-lived page access token in config.accessToken, config.instagramBusinessAccountId
```

Key validation rules:
- `text.length <= 2200`
- `media` required, `media.type === 'image'`
- `media.fileSizeBytes <= 8MB`

- [ ] **Step 2: Implement LinkedIn API posting strategy**

```typescript
// src/plugins/posting-strategies/linkedin-api.ts
// LinkedIn Marketing API: register upload → upload binary → create UGC post
// validateInput: text <= 3000, media optional (image only this milestone)
// Auth: OAuth 2.0 access token in config.accessToken, config.personUrn or config.organizationUrn
```

- [ ] **Step 3: Implement Pinterest API posting strategy**

```typescript
// src/plugins/posting-strategies/pinterest-api.ts
// Pinterest API v5: create Pin
// validateInput: requires media (image), text <= 500, requires platformMeta.boardId
// Auth: OAuth 2.0 access token in config.accessToken
```

- [ ] **Step 4: Implement Telegram Bot API posting strategy**

```typescript
// src/plugins/posting-strategies/telegram-api.ts
// Telegram Bot API: sendPhoto or sendMessage
// validateInput: text <= 4096, media optional (image only)
// Auth: config.botToken, config.channelId
// Simplest API — direct HTTP POST, no SDK needed
```

- [ ] **Step 5: Implement Newsletter file-output stub**

```typescript
// src/plugins/posting-strategies/newsletter-stub.ts
// Saves HTML email to assets/newsletters/
// validateInput: requires platformMeta.subject
// Generates simple HTML with text + image
```

- [ ] **Step 6: Write tests for ALL Tier 1 plugins**

Each plugin gets a dedicated test file covering:
- Construction with empty credentials succeeds (credential-lenient)
- `validateInput()` enforces platform-specific rules (text length, media requirements)
- `validateInput()` passes for valid input

Specific test cases:
- **Instagram:** rejects text-only (requires image), rejects text > 2200 chars, accepts image + caption
- **LinkedIn:** accepts text-only, accepts text + image, rejects video, rejects text > 3000 chars
- **Pinterest:** requires image, requires `platformMeta.boardId`, rejects text > 500 chars
- **Telegram:** accepts text-only, accepts text + image, rejects text > 4096 chars
- **Newsletter:** requires `platformMeta.subject`, saves HTML to file, accepts text + image

- [ ] **Step 7: Run all tests**

```bash
npx vitest run
```

- [ ] **Step 8: Commit**

```bash
git add src/plugins/posting-strategies/ tests/plugins/posting-strategies/
# Commit: "feat(sp4): tier 1 platform plugins — Instagram, LinkedIn, Pinterest, Telegram, Newsletter"
```

---

## Task 5: Platform Posting Plugins — Tier 2 & 3 Stubs

**Files:**
- Create: `src/plugins/posting-strategies/tiktok-stub.ts`
- Create: `src/plugins/posting-strategies/youtube-stub.ts`
- Create: `src/plugins/posting-strategies/reddit-stub.ts`
- Create: `src/plugins/posting-strategies/blog-stub.ts`
- Test: `tests/plugins/posting-strategies/stubs.test.ts`

- [ ] **Step 1: Implement all 4 stubs**

Each stub:
- Has full `validateInput()` with platform-specific constraints
- `post()` throws descriptive "not implemented" error explaining what's needed

```typescript
// tiktok-stub.ts
validateInput(input: PostInput): void {
  if (!input.media || input.media.type !== 'video') {
    throw new Error('TikTok requires video media. Video generation pipeline not yet implemented.');
  }
  if (input.media.mimeType !== 'video/mp4') {
    throw new Error('TikTok requires MP4 video format.');
  }
}
async post(): Promise<PostResult> {
  throw new Error('TikTok posting not yet implemented. Requires Content Publishing API approval.');
}
```

Similar patterns for YouTube (video required), Reddit (subreddit + title required), Blog (slug + title required).

- [ ] **Step 2: Write stub validation tests**

```typescript
// tests/plugins/posting-strategies/stubs.test.ts
describe('TikTok stub', () => {
  it('rejects non-video media', () => { ... });
  it('post() throws not-implemented', () => { ... });
});
// Similar for YouTube, Reddit, Blog
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/plugins/posting-strategies/stubs.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/plugins/posting-strategies/ tests/plugins/posting-strategies/stubs.test.ts
# Commit: "feat(sp4): tier 2+3 stubs — TikTok, YouTube, Reddit, Blog with validators"
```

---

## Task 6: Generate-Visual — Persist mediaMeta

**Files:**
- Modify: `src/worker/handlers/generate-visual.ts`

- [ ] **Step 1: Update generate-visual to persist mediaMeta**

After screenshot, store media metadata on the content item:

```typescript
// After: const visualUrl = await deps.assetStore.store(contentItemId, buffer, 'png');
const fileSizeBytes = buffer.length;
const width = (templateConfig?.config as any)?.width ?? 1200;
const height = (templateConfig?.config as any)?.height ?? 628;

await deps.db.update(contentItems)
  .set({
    visualUrl,
    mediaMeta: { mimeType: 'image/png', width, height, fileSizeBytes },
    generationStatus: GENERATION_STATUS.READY,
    reviewStatus: REVIEW_STATUS.PENDING,
  })
  .where(eq(contentItems.id, contentItemId));
```

- [ ] **Step 2: Verify existing tests still pass**

```bash
npx vitest run
```

- [ ] **Step 3: Commit**

```bash
git add src/worker/handlers/generate-visual.ts
# Commit: "feat(sp4): persist mediaMeta (mimeType, width, height, fileSizeBytes) in generate-visual"
```

---

## Task 7: Platform-Aware Post Routing

**Files:**
- Modify: `src/domain/review-workflow.ts`
- Test: `tests/domain/review-workflow-routing.test.ts`

- [ ] **Step 1: Write routing tests**

These tests must exercise `createPostsForContent()` behavior, not just the helper functions (which are already tested in Task 2). Since `createPostsForContent` requires DB access, these are integration-level tests against the test database.

```typescript
// tests/domain/review-workflow-routing.test.ts
// Tests to cover:
// 1. Explicit platform: template with platform='twitter' → only twitter accounts get posts
// 2. NULL platform + image content → excludes tiktok/youtube/reddit/blog accounts
// 3. NULL platform + text-only content → excludes instagram/pinterest (require image)
// 4. Zero-match: template with platform='tiktok' but no tiktok accounts → no posts created, no error thrown
// 5. Job enqueueing: each created post has a corresponding POST_TO_PLATFORM job in the queue
```

**Required:** Extract the account-filtering logic into a pure function `filterAccountsByCompatibility(accounts, templatePlatform, contentMediaType)` AND test the orchestration around `createPostsForContent()` using mocked DB/jobQueue/logger. Both levels must be tested:

```typescript
import { describe, it, expect } from 'vitest';
import { filterAccountsByCompatibility } from '../../src/domain/review-workflow.js';

describe('filterAccountsByCompatibility', () => {
  const accounts = [
    { platform: 'twitter', status: 'active' },
    { platform: 'instagram', status: 'active' },
    { platform: 'tiktok', status: 'active' },
    { platform: 'telegram', status: 'active' },
  ];

  it('explicit platform filters to matching only', () => {
    const result = filterAccountsByCompatibility(accounts as any, 'twitter', 'image');
    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe('twitter');
  });

  it('NULL platform with image excludes tiktok', () => {
    const result = filterAccountsByCompatibility(accounts as any, null, 'image');
    expect(result.map(a => a.platform)).toEqual(['twitter', 'instagram', 'telegram']);
  });

  it('NULL platform with text-only excludes instagram', () => {
    const result = filterAccountsByCompatibility(accounts as any, null, 'text-only');
    expect(result.map(a => a.platform)).toEqual(['twitter', 'telegram']);
  });

  it('returns empty array when no match', () => {
    const result = filterAccountsByCompatibility(accounts as any, 'youtube', 'image');
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Update createPostsForContent in review-workflow.ts**

Add `logger` parameter to `createPostsForContent` and update call sites in `approveContent` and `editAndApprove` to pass it. Also update the API routes in `src/web/api/content-items.ts` to pass a logger (import `createChildLogger` or pass the Fastify logger).

```typescript
import { contentTemplates } from '../shared/schema/content-templates.js';
import { getContentMediaType, isCompatible } from '../shared/platform-compatibility.js';
import { logger as defaultLogger } from '../shared/logger.js';

async function createPostsForContent(
  db: DB, jobQueue: JobQueue, contentItemId: string, verticalId: string,
  log: typeof defaultLogger = defaultLogger,
): Promise<void> {
  // Get content item and template for routing
  const [contentItem] = await db.select().from(contentItems)
    .where(eq(contentItems.id, contentItemId));
  const [template] = contentItem?.templateId
    ? await db.select().from(contentTemplates).where(eq(contentTemplates.id, contentItem.templateId))
    : [null];

  // Get all active accounts for this vertical
  let activeAccounts = await db.select().from(accounts)
    .where(and(eq(accounts.verticalId, verticalId), eq(accounts.status, 'active')));

  // Filter by platform
  if (template?.platform) {
    activeAccounts = activeAccounts.filter(a => a.platform === template.platform);
  } else {
    // NULL platform — filter by content compatibility
    const mediaType = getContentMediaType(contentItem?.visualUrl ?? null);
    activeAccounts = activeAccounts.filter(a => isCompatible(a.platform, mediaType));
  }

  // Zero-match: warn and return
  if (activeAccounts.length === 0) {
    log.warn({ contentItemId, templateName: template?.name, mediaType: getContentMediaType(contentItem?.visualUrl ?? null) },
      'No matching active accounts — approval succeeded but no posts created');
    return;
  }

  // Create posts + enqueue jobs
  for (const account of activeAccounts) { ... }
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add src/domain/review-workflow.ts tests/domain/
# Commit: "feat(sp4): platform-aware post routing with COMPATIBLE_PLATFORMS filter"
```

---

## Task 8: Post-to-Platform Handler — Media, DryRun, Validation

**Files:**
- Modify: `src/worker/handlers/post-to-platform.ts`
- Modify: `src/worker/index.ts` (pass `assetDir` to handler deps)

Update `PostToPlatformDeps` interface to include `assetDir: string`. Update the handler call site in `worker/index.ts` to pass `config.ASSET_DIR`.

- [ ] **Step 1: Rewrite handler with new flow**

1. Resolve posting strategy from registry
2. Build `PostInput` from content item + mediaMeta + platformMeta (merged from account + template)
3. Call `validateInput()` — on failure, set `posts.status = 'failed'` + `failure_reason`, return without throwing
4. Check `dryRun` flag — if true, save to dry-run JSON, return fake result
5. Call `post()` — on success update `status`, `platformPostId`, `postedAt`, `url`. On API failure, throw (queue retries)

```typescript
// Fetch template for platformMeta merge
const [template] = item.templateId
  ? await deps.db.select().from(contentTemplates).where(eq(contentTemplates.id, item.templateId))
  : [null];

// Resolve strategy name from account config (same fallback as before)
const strategyName = accountConfig.postingStrategy ?? 'twitter-api';

// Resolve strategy — pass full merged credentials so each strategy picks what it needs
const strategyConfig = {
  ...deps.appCredentials,                          // app-level keys (Twitter API key/secret)
  ...(accountCreds as Record<string, unknown>),    // per-account tokens (accessToken, botToken, etc.)
  ...(accountConfig as Record<string, unknown>),   // account config (channelId, instagramBusinessAccountId, etc.)
};
const postingStrategy = deps.postingStrategyRegistry.resolve(strategyName, strategyConfig);

// Build media from mediaMeta
let media: MediaInput | undefined;
if (item.visualUrl) {
  const mm = item.mediaMeta as Record<string, unknown>;
  media = {
    type: (mm.mimeType as string)?.startsWith('video/') ? 'video' : 'image',
    path: deps.assetStore.resolve(item.visualUrl),
    mimeType: (mm.mimeType as string) ?? 'image/png',
    width: mm.width as number,
    height: mm.height as number,
    fileSizeBytes: mm.fileSizeBytes as number,
  };
}

// Merge platformMeta: account defaults + template overrides
const accountMeta = (accountConfig.platformMeta ?? {}) as Record<string, unknown>;
const templateMeta = (template?.platformMeta ?? {}) as Record<string, unknown>;
const platformMeta = { ...accountMeta, ...templateMeta };

// Validate
try {
  postingStrategy.validateInput({ text, media, platformMeta });
} catch (err) {
  await db.update(posts).set({
    status: POST_STATUS.FAILED,
    failureReason: err instanceof Error ? err.message : String(err),
  }).where(eq(posts.id, postId));
  deps.logger.warn({ postId, error: (err as Error).message }, 'Post validation failed — config error, no retry');
  return; // don't throw — job completes, no retry
}

// DryRun check
const isDryRun = (accountConfig.dryRun as boolean) ?? false;
if (isDryRun) {
  // Save validated input to dry-run JSON — use injected asset dir, not hardcoded path
  const dryRunStrategy = deps.postingStrategyRegistry.resolve('dry-run', { outputDir: deps.assetDir + '/dry-run' });
  const result = await dryRunStrategy.post({ text, media, platformMeta });
  await db.update(posts).set({
    status: POST_STATUS.POSTED,
    postedAt: result.postedAt,
    platformPostId: result.platformPostId,
  }).where(eq(posts.id, postId));
  deps.logger.info({ postId, accountName: account.name, dryRun: true }, 'Dry-run post (validated against real platform)');
  return;
}

// Real post
const result = await postingStrategy.post({ text, media, platformMeta });
```

- [ ] **Step 2: Write handler tests**

```typescript
// tests/worker/handlers/post-to-platform.test.ts
// Test cases (with mocked DB + registry):
// 1. Validation failure → posts.status = 'failed', posts.failure_reason set, job completes (no throw)
// 2. DryRun = true → validateInput() called on real strategy, post() NOT called, JSON saved to dry-run dir
// 3. Successful post → posts.status = 'posted', platformPostId + url persisted
// 4. platformMeta merge → account defaults overridden by template values
// 5. Missing mediaMeta → PostInput.media is undefined (text-only post)
```

- [ ] **Step 3: Verify TypeScript compiles + tests pass**

```bash
npx tsc --noEmit
npx vitest run tests/worker/handlers/post-to-platform.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/worker/handlers/post-to-platform.ts tests/worker/handlers/
# Commit: "feat(sp4): post handler — media metadata, platformMeta merge, dryRun flag, validation + tests"
```

---

## Task 9: Register All Strategies in Worker

**Files:**
- Modify: `src/worker/index.ts`

- [ ] **Step 1: Import and register all 10 strategies + dry-run**

```typescript
import { InstagramApiPostingStrategy } from '../plugins/posting-strategies/instagram-api.js';
import { LinkedInApiPostingStrategy } from '../plugins/posting-strategies/linkedin-api.js';
import { PinterestApiPostingStrategy } from '../plugins/posting-strategies/pinterest-api.js';
import { TelegramApiPostingStrategy } from '../plugins/posting-strategies/telegram-api.js';
import { NewsletterStubPostingStrategy } from '../plugins/posting-strategies/newsletter-stub.js';
import { TikTokStubPostingStrategy } from '../plugins/posting-strategies/tiktok-stub.js';
import { YouTubeStubPostingStrategy } from '../plugins/posting-strategies/youtube-stub.js';
import { RedditStubPostingStrategy } from '../plugins/posting-strategies/reddit-stub.js';
import { BlogStubPostingStrategy } from '../plugins/posting-strategies/blog-stub.js';

// Register all
postingStrategyRegistry.register('twitter-api', (cfg) => new TwitterApiPostingStrategy(cfg));
postingStrategyRegistry.register('instagram-api', (cfg) => new InstagramApiPostingStrategy(cfg));
postingStrategyRegistry.register('linkedin-api', (cfg) => new LinkedInApiPostingStrategy(cfg));
postingStrategyRegistry.register('pinterest-api', (cfg) => new PinterestApiPostingStrategy(cfg));
postingStrategyRegistry.register('telegram-api', (cfg) => new TelegramApiPostingStrategy(cfg));
postingStrategyRegistry.register('newsletter', (cfg) => new NewsletterStubPostingStrategy(cfg));
postingStrategyRegistry.register('tiktok-api', (cfg) => new TikTokStubPostingStrategy(cfg));
postingStrategyRegistry.register('youtube-api', (cfg) => new YouTubeStubPostingStrategy(cfg));
postingStrategyRegistry.register('reddit-api', (cfg) => new RedditStubPostingStrategy(cfg));
postingStrategyRegistry.register('blog', (cfg) => new BlogStubPostingStrategy(cfg));
postingStrategyRegistry.register('dry-run', (cfg) => new DryRunPostingStrategy(cfg));
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/worker/index.ts
# Commit: "feat(sp4): register all 10 platform strategies in worker"
```

---

## Task 10: Web API + Dashboard — Expose url and failureReason

**Files:**
- Modify: `src/web/api/posts.ts`
- Modify: `src/web/dashboard/src/pages/PostMonitor.tsx`

- [ ] **Step 1: Add url and failureReason to posts API response**

In `src/web/api/posts.ts`, add `posts.url` and `posts.failureReason` to the select query:

```typescript
// Add to the select fields in GET /api/posts
url: posts.url,
failureReason: posts.failureReason,
```

- [ ] **Step 2: Update PostMonitor to display failureReason and url**

In `src/web/dashboard/src/pages/PostMonitor.tsx`:
- Show `failureReason` on failed posts (red text below the error indicator)
- Show `url` as a clickable link on posted items ("View on platform →")

- [ ] **Step 3: Verify in browser**

Start web + dashboard, check Post Monitor shows the new fields for existing dry-run posts.

- [ ] **Step 4: Commit**

```bash
git add src/web/api/posts.ts src/web/dashboard/
# Commit: "feat(sp4): expose url + failureReason in posts API and Post Monitor dashboard"
```

---

## Task 11: Seed Data — Multi-Platform Accounts + Templates

**Files:**
- Modify: `db/seed.sql`

- [ ] **Step 1: Add new accounts per vertical**

Gold/Forex: add Instagram, LinkedIn, Telegram accounts (all with real `postingStrategy` + `dryRun: true`)
Fitness: add Instagram, Pinterest, Newsletter accounts
Dating: add Instagram, TikTok accounts

- [ ] **Step 2: Add platform-specific content templates**

For each vertical, add templates with `platform` field set and appropriate `visualTemplate.config` dimensions:
- `gold-price-alert-instagram` (platform: instagram, 1080x1080 visual)
- `fitness-tip-pinterest` (platform: pinterest, 1000x1500 visual, 2:3 ratio)
- `dating-tip-instagram` (platform: instagram, 1080x1350 visual, 4:5 ratio)

Place account-scoped config in `accounts.config.platformMeta` (e.g., Pinterest `boardId`, Telegram `channelId`). Place per-template overrides in `content_templates.platform_meta` (e.g., Newsletter `subject`, Pinterest link/title overrides). Follow the merge contract: `{ ...accountMeta, ...templateMeta }`.

- [ ] **Step 3: Re-seed and verify**

```bash
psql $VIRAL_DATABASE_URL -f db/seed.sql
psql $VIRAL_DATABASE_URL -c "SELECT a.name, a.platform, a.config->>'postingStrategy' as strategy, a.config->>'dryRun' as dry_run FROM accounts a ORDER BY a.name;"
```

Expected: 12+ accounts across 3 verticals with correct strategies.

- [ ] **Step 4: Commit**

```bash
git add db/seed.sql
# Commit: "feat(sp4): seed data — multi-platform accounts + platform-specific content templates"
```

---

## Task 12: Full Verification

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass (51 existing + ~20 new).

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Start all 3 processes**

Open 3 terminals:

```bash
# Terminal 1: Web API
npm run dev:web

# Terminal 2: Worker
npm run dev:worker

# Terminal 3: Dashboard
npm run dev:dashboard
```

Verify in worker logs:
- Gold/Forex trigger fires → creates posts for Twitter + Instagram + LinkedIn + Telegram accounts
- Fitness scheduled trigger fires → creates posts for Twitter + Instagram + Pinterest + Newsletter accounts
- All posts go through validation → dry-run JSON saved
- Posts with platform-mismatched content are NOT created (e.g., TikTok excluded from image content)

- [ ] **Step 4: Verify dashboard**

Open http://localhost:5174/posts — verify posts from multiple platforms appear in Post Monitor.

- [ ] **Step 5: Commit**

```bash
git add -A
# Commit: "feat(sp4): Multi-Platform Posting — 10 platforms, validation, routing, dry-run flag"
```
