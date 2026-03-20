# ViralEngine — Sub-project #4: Multi-Platform Posting

**Date:** 2026-03-19
**Status:** Draft
**Scope:** Expand posting from Twitter-only to 10 platforms with per-platform validation, media metadata, and platform-aware post routing.

---

## 1. Overview

Add posting support for 10 platforms: Twitter/X (existing), Instagram, LinkedIn, Pinterest, Telegram, Newsletter, TikTok, YouTube, Reddit, and Blog. Each platform is a `PostingStrategy` plugin behind the existing registry pattern. Platforms that work with current content (text + image) get full implementations. Platforms requiring video or long-form content get working stubs that validate inputs and fail gracefully.

The review workflow is updated to route approved content to platform-matched accounts only (using `content_templates.platform` field).

### What this sub-project delivers

- Expanded `PostInput` with media metadata (type, dimensions, duration, MIME type)
- Per-platform input validation (`validateInput()` method on every posting strategy)
- 5 full API implementations: Twitter (refactored), Instagram, LinkedIn, Pinterest, Telegram
- 1 file-output implementation: Newsletter (saves HTML to file — swap to Resend/SendGrid API later)
- 4 interface stubs: TikTok, YouTube, Reddit, Blog (validate inputs, fail with descriptive errors when required content format is missing)
- Platform-aware post routing: `content_templates.platform` filters which accounts receive posts on approval
- Seed data with multi-platform accounts and platform-specific content templates for all 3 verticals

### Schema changes

**posts table:**
- Add `url` TEXT (nullable) — direct link to the posted content on the platform
- Add `failure_reason` TEXT (nullable) — descriptive error message when `status = 'failed'`

**content_items table:**
- Add `media_meta` JSONB NOT NULL DEFAULT '{}' — persisted by `generate-visual` handler: `{ mimeType, width, height, fileSizeBytes }`. Read by `post-to-platform` handler to build `PostInput.media`.

**content_templates table:**
- Add `platform_meta` JSONB NOT NULL DEFAULT '{}' — platform-specific metadata per template (e.g., Newsletter subject, Pinterest board, Blog slug). Merged with `accounts.config.platformMeta` at post time (template takes precedence).

### What this sub-project does NOT deliver

- Video generation pipeline (TikTok/YouTube stubs exist but can't produce video content)
- Long-form content generation (Reddit/Blog stubs exist but can't produce articles)
- Newsletter subscriber management (Newsletter stub saves to file; production email provider is a future decision)
- Design-time template validation (no UI for warning about dimension mismatches when creating templates)
- Platform-specific visual dimensions in existing content templates (each platform's ideal image size is documented but not enforced at template creation time — only at post time)

---

## 2. Dependencies

- **Requires:** Sub-project #1 (Core Pipeline MVP) + Sub-project #3 (Multi-Vertical Framework)
- **New npm packages:** None for core infrastructure. Platform SDKs installed as needed (e.g., `instagram-graph-api`, `linkedin-api-client`, etc. — or direct HTTP calls)

---

## 3. Expanded PostInput Interface

### Current

```typescript
interface PostInput {
  text: string;
  imagePath?: string;
}
```

### New

```typescript
interface MediaInput {
  type: 'image' | 'video' | 'gif' | 'carousel';
  path: string;                  // local file path to primary media
  mimeType: string;              // 'image/png', 'image/jpeg', 'video/mp4', etc.
  width?: number;                // pixels
  height?: number;               // pixels
  durationMs?: number;           // video/gif duration in milliseconds
  fileSizeBytes?: number;        // for pre-upload validation
  altText?: string;              // accessibility text
  additionalPaths?: string[];    // carousel items (Instagram multi-image)
}

interface PostInput {
  text: string;
  media?: MediaInput;
  platformMeta?: Record<string, unknown>;  // platform-specific metadata
}

interface PostResult {
  platformPostId: string;
  postedAt: Date;
  url?: string;  // direct link to the posted content (if available)
}

interface PostingStrategy {
  validateInput(input: PostInput): void;  // throws on invalid input
  post(input: PostInput): Promise<PostResult>;
}
```

### platformMeta examples per platform

| Platform | platformMeta fields |
|---|---|
| Reddit | `{ subreddit: "r/fitness", flair: "Tips", title: "..." }` |
| Pinterest | `{ boardId: "...", link: "https://...", title: "..." }` |
| Blog | `{ slug: "weekly-gold-recap", title: "...", seoKeywords: [...], category: "finance" }` |
| Newsletter | `{ subject: "Gold Weekly Recap", listId: "...", fromName: "Gold Forex EN" }` |
| YouTube | `{ title: "...", tags: [...], privacy: "public", categoryId: "22" }` |
| TikTok | `{ title: "...", privacyLevel: "PUBLIC_TO_EVERYONE" }` |
| Others | `{}` — no special metadata needed for Twitter, Instagram, LinkedIn, Telegram |

---

## 4. Per-Platform Validation

Every `PostingStrategy` plugin implements `validateInput()` which is called before `post()`. It throws a descriptive error if the input doesn't meet the platform's requirements.

### Platform constraints

| Platform | Text limit | Media required? | Accepted media (this milestone) | Aspect ratio | Max file size |
|---|---|---|---|---|---|
| Twitter/X | 280 chars | Optional | image (PNG/JPEG/GIF) | Any | 5MB |
| Instagram | 2,200 chars | Required (image) | image (JPEG/PNG) | 1:1, 4:5, 16:9 | 8MB |
| LinkedIn | 3,000 chars | Optional | image (PNG/JPEG) | Any | 5MB |
| Pinterest | 500 chars | Required (image) | image (PNG/JPEG) | 2:3 recommended, min 600px wide | 20MB |
| Telegram | 4,096 chars | Optional | image (PNG/JPEG) | Any | 10MB |
| Newsletter | Unlimited | Optional | inline image in HTML | Any | N/A (embedded) |
| TikTok | 2,200 chars | Required (video) | video (MP4) — **stub, not implemented** | 9:16 (1080x1920) | 4GB, max 10min |
| YouTube | 5,000 chars (desc) | Required (video) | video (MP4) — **stub, not implemented** | 16:9 or 9:16 (Shorts) | 256GB, max 12hr |
| Reddit | 40,000 chars | Optional | image via URL — **stub, not implemented** | Any | Via link, not upload |
| Blog | Unlimited | Optional | featured image — **stub, not implemented** | Any | N/A |

**Note:** Video upload support for Instagram, LinkedIn, and Telegram validators is deferred to the video generation sub-project. This milestone's validators for Tier 1 platforms only accept `media.type === 'image'`.

### Validation behavior

- `validateInput()` is called by the `post-to-platform` handler BEFORE calling `post()`
- If validation fails, the post is marked `status = 'failed'` with the error message
- The error message is descriptive and actionable: "Instagram requires media. Content template 'fitness-tip-instagram' must have a visual template (skipVisual cannot be true for Instagram)."
- Validation failures are NOT retried — on validation failure, the handler sets `posts.status = 'failed'` with the error message, logs the error, and **returns without throwing** so the job completes successfully in the queue (no retry). This is a configuration error, not a transient failure.
- When `content_items.visual_url` is NULL (skipVisual templates), `PostInput.media` is omitted. Platforms that require media (Instagram, Pinterest, TikTok, YouTube) will fail validation with a descriptive message: "Media required for [platform]. Content template must not use skipVisual: true."

---

## 5. Platform Plugins — Implementation Tiers

### Tier 1: Full implementation (text + image works today)

**Twitter/X** (`twitter-api.ts` — refactor existing)
- Already built. Refactor to use new `PostInput.media` instead of `imagePath`.
- Add `validateInput()` method.

**Instagram** (`instagram-api.ts` — new)
- Uses Meta Graph API (Instagram Content Publishing API)
- Requires: Instagram Business/Creator account linked to a Facebook Page
- Auth: OAuth 2.0 via Facebook Login → long-lived page token stored in `accounts.credentials`
- Flow: upload image → create media container → publish
- `platformMeta`: none needed (caption = text, image from media)

**LinkedIn** (`linkedin-api.ts` — new)
- Uses LinkedIn Marketing API (or Community Management API for personal profiles)
- Auth: OAuth 2.0 → access token in `accounts.credentials`
- Flow: register image upload → upload binary → create post with image URN
- `platformMeta`: none needed

**Pinterest** (`pinterest-api.ts` — new)
- Uses Pinterest API v5
- Auth: OAuth 2.0 → access token in `accounts.credentials`
- Flow: create Pin with image URL or upload + description + board
- `platformMeta`: `{ boardId: "...", link: "https://..." }`
- Requires: Business account

**Telegram** (`telegram-api.ts` — new)
- Uses Telegram Bot API (simplest of all — HTTP POST with bot token)
- Auth: Bot token stored in `accounts.credentials.botToken`
- Flow: `sendPhoto` (image + caption) or `sendMessage` (text only)
- `platformMeta`: none (channel ID in `accounts.credentials.channelId`)
- Requires: Create bot via BotFather, add as admin to channel

**Newsletter** (`newsletter-stub.ts` — new)
- Day 1: Saves email HTML to `assets/newsletters/` directory (like dry-run for email)
- Future: Swap to Resend/SendGrid API
- `platformMeta`: `{ subject: "...", fromName: "...", listId: "..." }`
- Generates simple HTML email from text + image
- `validateInput()`: requires `platformMeta.subject`; `listId` optional for stub (required when real provider is wired)

### Tier 2: Stubs (needs video pipeline)

**TikTok** (`tiktok-stub.ts` — new)
- `validateInput()`: requires `media.type === 'video'`, `media.mimeType === 'video/mp4'`, 9:16 aspect ratio
- `post()`: throws "TikTok posting requires video content. Video generation pipeline not yet implemented."
- Future: Content Publishing API with OAuth 2.0

**YouTube** (`youtube-stub.ts` — new)
- `validateInput()`: requires `media.type === 'video'`
- `post()`: throws "YouTube posting requires video content. Video generation pipeline not yet implemented."
- Future: YouTube Data API v3 with Google OAuth 2.0

### Tier 3: Stubs (needs long-form content)

**Reddit** (`reddit-stub.ts` — new)
- `validateInput()`: requires `platformMeta.subreddit`, `platformMeta.title`
- `post()`: throws "Reddit posting requires long-form content and subreddit targeting. Not yet implemented."
- Future: Reddit API with OAuth 2.0

**Blog** (`blog-stub.ts` — new)
- `validateInput()`: requires `platformMeta.slug`, `platformMeta.title`
- `post()`: throws "Blog posting requires long-form HTML content. Not yet implemented."
- Future: WordPress REST API with application passwords

### Dry-Run Mode

Dry-run is NOT a separate posting strategy. Instead, it is a **flag on the account**: `accounts.config.dryRun: true`. When `dryRun` is true:

1. The handler resolves the **real** platform strategy (e.g., `instagram-api`)
2. Calls `validateInput()` on the real strategy — **validation runs even in dry-run mode**
3. Instead of calling `post()`, saves the validated `PostInput` as a JSON file to `assets/dry-run/` and returns a fake `PostResult`

This ensures that seed accounts configured with `"postingStrategy": "instagram-api", "dryRun": true` get full validation without making real API calls. The existing `dry-run.ts` strategy is kept as a legacy fallback for accounts that don't have a real strategy configured yet.

**Account config example:**
```json
{
  "postingStrategy": "instagram-api",
  "dryRun": true
}
```

When ready to go live, change `dryRun` to `false` and add credentials.

---

## 6. Platform-Aware Post Routing

### Current behavior

On content approval, `createPostsForContent()` creates a post row for **every** active account in the vertical — regardless of platform.

### New behavior

On content approval, `createPostsForContent()` checks `content_templates.platform`:

- If `platform` is set (e.g., `"instagram"`): only create posts for active accounts with matching `accounts.platform`
- If `platform` is NULL: create posts for all active accounts **that support the content's media type**. Accounts whose platform requires a content format the pipeline hasn't produced (e.g., TikTok requiring video when only an image exists) are excluded. This is determined by a `COMPATIBLE_PLATFORMS` map that defines which media types each platform accepts:

```typescript
const COMPATIBLE_PLATFORMS: Record<string, Set<string>> = {
  'twitter': new Set(['image', 'text-only']),
  'instagram': new Set(['image']),
  'linkedin': new Set(['image', 'text-only']),
  'pinterest': new Set(['image']),
  'telegram': new Set(['image', 'text-only']),
  'newsletter': new Set(['image', 'text-only']),
  'tiktok': new Set(['video']),
  'youtube': new Set(['video']),
  'reddit': new Set(['long-form']),
  'blog': new Set(['long-form']),
};
```

Content with a PNG visual → `'image'`. Content with `skipVisual: true` → `'text-only'`. This prevents NULL-platform templates from creating guaranteed-to-fail posts on video/long-form accounts.

### Zero-match behavior

If the filtered account set is empty (no active accounts match the template's platform or media type):

1. The approval still succeeds (content is marked `approved`)
2. **No post rows are created** (avoids FK issues — `posts.account_id` is required)
3. A warning is logged: "No matching active accounts for template [name] (platform: [platform], media: [type])"
4. The dashboard can surface orphaned approvals via: `content_items WHERE review_status = 'approved' AND NOT EXISTS (SELECT 1 FROM posts WHERE content_id = content_items.id)` — this query powers an "Unposted" indicator in the Post Monitor (future dashboard enhancement, not in this SP)

### Implementation

```typescript
// In review-workflow.ts → createPostsForContent(db, jobQueue, contentItemId, verticalId, templateId)
const [template] = await db.select().from(contentTemplates).where(eq(contentTemplates.id, templateId));
const [contentItem] = await db.select().from(contentItems).where(eq(contentItems.id, contentItemId));

// Step 1: Determine content's media type
const mediaType = contentItem.visualUrl ? 'image' : 'text-only';

// Step 2: Get all active accounts for this vertical
let activeAccounts = await db.select().from(accounts)
  .where(and(eq(accounts.verticalId, verticalId), eq(accounts.status, 'active')));

// Step 3: Filter by platform
if (template.platform) {
  // Explicit platform → only matching accounts
  activeAccounts = activeAccounts.filter(a => a.platform === template.platform);
} else {
  // NULL platform → filter by content compatibility
  activeAccounts = activeAccounts.filter(a =>
    COMPATIBLE_PLATFORMS[a.platform]?.has(mediaType)
  );
}

// Step 4: Handle zero-match — no post rows created, just log
if (activeAccounts.length === 0) {
  logger.warn({ templateName: template.name, platform: template.platform, mediaType },
    'No matching active accounts — approval succeeded but no posts created');
  return; // no post rows, no jobs — content is approved but unposted
}

// Step 5: Create posts + enqueue jobs for matched accounts
for (const account of activeAccounts) { ... }
```

### Example

Fitness vertical with 4 accounts: Twitter, Instagram, Pinterest, Newsletter (per seed data):

| Content Template | platform | Media type | Posts created |
|---|---|---|---|
| `fitness-tip-tweet` | `twitter` | image | → Fitness Daily EN (Twitter) only |
| `fitness-tip-instagram` | `instagram` | image | → Fitness Daily IG (Instagram) only |
| `fitness-weekly-recap` | NULL | image | → Twitter, Instagram, Pinterest, Newsletter (all 4 — all accept image) |
| `fitness-text-tip` | NULL | text-only | → Twitter, Newsletter (2 of 4 — Instagram and Pinterest require image) |

---

## 7. Post-to-Platform Handler Updates

The `post-to-platform` handler needs to:

1. **Resolve posting strategy** from `accounts.config.postingStrategy` via the registry

2. **Build `PostInput`** from content item data:
   - `text`: `finalText ?? generatedText`
   - `media`: built from `content_items.visual_url` + `content_items.media_meta`. If `visual_url` is NULL (skipVisual), `media` is omitted. **`media_meta` is the single source of truth** for all media metadata — no re-deriving from files at post time.
     - `path`: resolved via `AssetStore.resolve(visual_url)`
     - `mimeType`: from `media_meta.mimeType` (persisted by `generate-visual`)
     - `width` / `height`: from `media_meta.width` / `media_meta.height` (persisted by `generate-visual`)
     - `fileSizeBytes`: from `media_meta.fileSizeBytes` (persisted by `generate-visual`)
     - `type`: derived from `media_meta.mimeType` (`image/png` → `'image'`, `video/mp4` → `'video'`)
     - `altText`: omitted for now (no pipeline step generates alt text). Future: LLM-generated alt text or manual entry in review UI.
   - `platformMeta`: merged from two sources with template taking precedence: `{ ...accounts.config.platformMeta, ...content_templates.platform_meta }`. Account-level meta provides defaults (e.g., Pinterest `boardId`, Telegram `channelId`). Template-level meta provides per-content overrides (e.g., Newsletter `subject`, Blog `slug`).

3. **Call `validateInput()`** — if validation fails, set `posts.status = 'failed'`, store error in `posts.failure_reason`, log, and **return without throwing** (no retry).

4. **Check `dryRun` flag** from `accounts.config.dryRun`. If true: save validated `PostInput` to `assets/dry-run/` JSON, return fake `PostResult`. Skip `post()`.

5. **Call `post()`** — on success, update `posts.status`, `platformPostId`, `postedAt`, and `url`. On API failure, throw (job queue handles retry).

---

## 8. Worker Registration

All posting strategy plugins are registered in `worker/index.ts`:

```typescript
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

---

## 9. Seed Data Updates

Each vertical gets accounts and platform-specific content templates for the new platforms. All new accounts use their real `postingStrategy` (e.g., `instagram-api`) with `dryRun: true` — validation runs against real platform constraints, but no API calls are made. Switch `dryRun` to `false` and add credentials when ready to go live.

### Gold/Forex accounts (add to existing)

| Account | Platform | Language | postingStrategy | dryRun |
|---|---|---|---|---|
| Gold Forex EN | twitter | en | twitter-api | true |
| Altın Döviz TR | twitter | tr | twitter-api | true |
| Gold Forex IG | instagram | en | instagram-api | true |
| Gold Forex LinkedIn | linkedin | en | linkedin-api | true |
| Gold Forex Telegram | telegram | en | telegram-api | true |

### Fitness accounts (add to existing)

| Account | Platform | Language | postingStrategy | dryRun |
|---|---|---|---|---|
| Fitness Daily EN | twitter | en | twitter-api | true |
| Fitness Daily IG | instagram | en | instagram-api | true |
| Fitness Tips Pinterest | pinterest | en | pinterest-api | true |
| Fitness Weekly Newsletter | newsletter | en | newsletter | true |

### Dating accounts (add to existing)

| Account | Platform | Language | postingStrategy | dryRun |
|---|---|---|---|---|
| Dating Tips EN | twitter | en | twitter-api | true |
| Dating Tips IG | instagram | en | instagram-api | true |
| Dating Tips TikTok | tiktok | en | tiktok-api | true |

### Platform-specific content templates (examples)

For each vertical, add templates with `platform` field set:

- `gold-price-alert` (platform: NULL — posts to all) — already exists
- `gold-price-alert-instagram` (platform: `instagram` — 1080x1080 visual, longer caption)
- `fitness-tip-pinterest` (platform: `pinterest` — 1000x1500 visual, 2:3 ratio)
- `dating-tip-instagram` (platform: `instagram` — 1080x1350 visual, 4:5 ratio)

Templates without `platform` set continue to post to all active accounts for backwards compatibility.

---

## 10. File Changes

### Modified files

| File | Change |
|---|---|
| `src/plugins/posting-strategies/types.ts` | New `MediaInput`, expanded `PostInput`, `PostResult.url`, `validateInput()` on interface |
| `src/plugins/posting-strategies/twitter-api.ts` | Refactor to use `PostInput.media`, add `validateInput()` |
| `src/plugins/posting-strategies/dry-run.ts` | Update to log `media` metadata, add `validateInput()` (no-op) |
| `src/domain/review-workflow.ts` | Platform-aware routing in `createPostsForContent()`: explicit platform filter OR compatibility-based filter for NULL-platform templates. Zero-match: no post rows created, warning logged, early return. |
| `src/worker/handlers/post-to-platform.ts` | Build `PostInput` with `media` + `platformMeta`, call `validateInput()` before `post()` |
| `src/worker/index.ts` | Register all new posting strategy plugins |
| `src/shared/schema/posts.ts` | Add `url` and `failureReason` columns |
| `src/shared/schema/content-items.ts` | Add `mediaMeta` JSONB column |
| `src/shared/schema/content-templates.ts` | Add `platformMeta` JSONB column |
| `src/worker/handlers/generate-visual.ts` | Persist `mediaMeta` (mimeType, width, height, fileSizeBytes) after screenshot |
| `src/worker/handlers/post-to-platform.ts` | Read `mediaMeta` from content_items to build `PostInput.media` |
| `db/seed.sql` | Add multi-platform accounts and templates for all verticals |

### New files

| File | Purpose |
|---|---|
| `src/plugins/posting-strategies/instagram-api.ts` | Meta Graph API — image posts |
| `src/plugins/posting-strategies/linkedin-api.ts` | LinkedIn Marketing API — text + image posts |
| `src/plugins/posting-strategies/pinterest-api.ts` | Pinterest API v5 — Pin creation |
| `src/plugins/posting-strategies/telegram-api.ts` | Telegram Bot API — channel messages |
| `src/plugins/posting-strategies/newsletter-stub.ts` | Saves email HTML to file (swap to Resend/SendGrid later) |
| `src/plugins/posting-strategies/tiktok-stub.ts` | Validates video input, throws "not implemented" |
| `src/plugins/posting-strategies/youtube-stub.ts` | Validates video input, throws "not implemented" |
| `src/plugins/posting-strategies/reddit-stub.ts` | Validates long-form + subreddit, throws "not implemented" |
| `src/plugins/posting-strategies/blog-stub.ts` | Validates HTML + SEO meta, throws "not implemented" |

---

## 11. Success Criteria

### Interface & Validation
- [ ] `PostInput` supports `media` (type, path, mimeType, dimensions, duration, fileSize, altText)
- [ ] `PostInput` supports `platformMeta` for platform-specific metadata
- [ ] Every `PostingStrategy` implements `validateInput()` with platform-specific constraints
- [ ] Validation failures mark post as `failed` with descriptive error — no retry

### API Implementations (Tier 1)
- [ ] Twitter/X refactored to use `PostInput.media` — existing tests still pass
- [ ] Instagram posts image + caption via Meta Graph API
- [ ] LinkedIn posts text + image via Marketing API
- [ ] Pinterest creates Pin with image + description + board
- [ ] Telegram sends photo + caption to channel via Bot API

### File-Output Implementation
- [ ] Newsletter saves HTML email to `assets/newsletters/`

### Stubs (Tier 2 & 3)
- [ ] TikTok stub validates video requirement, throws descriptive error
- [ ] YouTube stub validates video requirement, throws descriptive error
- [ ] Reddit stub validates subreddit + title requirement, throws descriptive error
- [ ] Blog stub validates slug + title requirement, throws descriptive error

### Platform-Aware Routing
- [ ] Content templates with `platform` set only create posts for matching accounts
- [ ] Content templates with `platform = NULL` create posts for compatible active accounts only (excludes video/long-form platforms)
- [ ] Fitness Twitter template → only Fitness Twitter account
- [ ] Gold/Forex NULL-platform template with image → Twitter (x2), Instagram, LinkedIn, Telegram (all seeded Gold/Forex accounts that accept image)
- [ ] Zero-match case: approval succeeds, no post rows created, warning logged with template name and media type

### Dry-Run Mode
- [ ] Accounts with `dryRun: true` resolve real platform strategy
- [ ] `validateInput()` runs against real platform constraints in dry-run mode
- [ ] `post()` is skipped in dry-run — JSON saved to `assets/dry-run/` instead

### Schema & Persistence
- [ ] `posts.url` stores direct link to posted content
- [ ] `posts.failure_reason` stores validation/API error messages
- [ ] `content_templates.platform_meta` stores per-template platform metadata
- [ ] `platformMeta` merged from account + template (template takes precedence)

### End-to-End (target: test all, fallback: dry-run)
- [ ] Instagram: create Business account, link to Facebook Page, post real image
- [ ] LinkedIn: create Company Page or use personal profile, post real image
- [ ] Pinterest: create Business account, post real Pin
- [ ] Telegram: create bot, add to test channel, send real message
- [ ] Newsletter: verify HTML file saved to `assets/newsletters/`
- [ ] All platforms work in dry-run mode as fallback

### Regression
- [ ] Gold/Forex event-driven pipeline still works (SP#1 + SP#3)
- [ ] Fitness/Dating scheduled triggers still fire (SP#3)
- [ ] Existing Twitter dry-run posting still works
- [ ] All existing tests pass
