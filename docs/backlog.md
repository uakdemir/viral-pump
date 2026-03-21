# ViralEngine — Backlog

Future improvements, optimizations, and ideas. Prioritized by impact.
Items move from here into sub-project specs when ready to implement.

---

## Performance Optimizations

### Replace Puppeteer with Satori for visual generation
**Priority:** Medium (optimize when generating 50+ images/day)
**Context:** Current Puppeteer approach works but is heavy (~50MB Chrome binary, ~4s per image). Satori (Vercel) converts JSX/HTML to SVG to PNG in ~100ms with 500KB footprint — no browser needed. 5x faster, 100x lighter.
**Limitation:** Satori only supports flexbox layout (no CSS grid). Our current card templates are flexbox-only, so this is fine.
**Implementation:** New `SatoriVisualGenerator` plugin behind the existing `VisualGenerator` interface. Zero architecture change. Configure per vertical in `content_templates.visualTemplate.provider`.
**Links:** [Satori GitHub](https://github.com/vercel/satori), [npm](https://www.npmjs.com/package/satori)
**Decided:** 2026-03-19

---

## Architecture Improvements

### Cache vertical config in EventDetector
**Priority:** Low
**Context:** `processEvents` queries the verticals table on every poll cycle to resolve the trigger evaluator name. The config almost never changes. Cache per vertical, refresh on startup or explicit signal.
**Decided:** 2026-03-19 (code review finding)

### Migrate LinkedIn API from deprecated ugcPosts to Community Management API
**Priority:** Medium (before first real LinkedIn deployment)
**Context:** Current implementation uses `v2/ugcPosts` and `v2/assets` endpoints which LinkedIn deprecated in 2023 in favor of Community Management API (`/rest/posts` + `/rest/images`). Works in dry-run but may fail when switching to real credentials.
**Decided:** 2026-03-20 (code review finding)

### Add handler-level tests for post-to-platform
**Priority:** Medium
**Context:** `handlePostToPlatform` orchestrates strategy resolution, media metadata, platformMeta merge, dry-run flow, validation failure handling, and success persistence. None of this is directly tested — only validators and routing have tests. Repeatedly flagged in code reviews.
**Decided:** 2026-03-20 (code review finding)

### Add integration tests for EventDetector and Scheduler
**Priority:** Low
**Context:** Core orchestration classes have no unit tests — only the pure domain functions are tested. Would require mock DB and mock job queue.
**Decided:** 2026-03-19 (code review finding)

### Fix hardcoded dimensions in HTML visual templates
**Priority:** Low
**Context:** HTML templates hardcode `width: 1200px; height: 628px` in CSS while Puppeteer reads configurable dimensions from `templateConfig.config`. If someone customizes dimensions, the CSS won't match. Either inject `{{width}}`/`{{height}}` placeholders or document the constraint.
**Decided:** 2026-03-19 (code review finding)

### Clean up stat-card.html dead CSS
**Priority:** Low
**Context:** `stat-card.html` defines `.stat-row`, `.stat-value`, `.stat-label` classes but the HTML body doesn't use them. Template looks identical to `tip-card.html` in practice.
**Decided:** 2026-03-19 (code review finding)

---

## Operations & Automation

### Instagram token auto-refresh cron
**Priority:** Medium (before first real Instagram deployment)
**Context:** Instagram access tokens expire every 60 days. Build a scheduled job that calls `GET /refresh_access_token` before expiry. ~20 lines of code. Without this, Instagram posting silently stops every 2 months until someone manually refreshes.
**Decided:** 2026-03-21

### "Connect Account" OAuth flow in dashboard
**Priority:** Medium (reduces manual work per new account)
**Context:** Currently, adding a new platform account requires manually generating tokens in developer portals and pasting them into SQL. A dashboard button ("Connect Twitter Account") that opens an OAuth popup, user authorizes, tokens stored in DB automatically — like Buffer/Hootsuite do. ~1-2 days per platform. Eliminates manual token copy-paste.
**Decided:** 2026-03-21

### Account health monitoring
**Priority:** Low
**Context:** Automated checks that tokens are still valid, accounts aren't suspended, rate limits aren't hit. Alerts when human action is needed (token expired, account flagged, rate limit approaching).
**Decided:** 2026-03-21

### Delegated account creation workflow
**Priority:** Low (when scaling beyond founder-operated)
**Context:** Use Meta Business Suite roles + Twitter Developer Portal team invites to delegate account creation to a VA or team member. Limited privileges — they create accounts + generate tokens, never see personal accounts. See `docs/guides/delegated-account-management.md` for the full workflow.
**Decided:** 2026-03-21

---

## Future Sub-Projects (from original decomposition)

### SP#2: Metrics Collector
Scrape/poll platform APIs for engagement data (views, likes, shares, clicks). Store in structured DB linked to posts. Depends on SP#1.

### SP#4: Multi-platform Posting
Add Instagram, TikTok, YouTube, Newsletter as output channels. Build as individual `PostingStrategy` plugins (in-house, not Postiz — see decision below). Depends on SP#1 or SP#3.

### SP#5: Learning Engine v1
Rule-based pattern matching. Correlate content attributes with performance metrics. Weekly optimization reports. Depends on SP#2.

### SP#6: Affiliate Tracking
Link shortener/UTM tracking, conversion attribution, revenue reporting. Depends on SP#1 + SP#2.

### SP#7: Learning Engine v2
ML-based reasoning. AI uses accumulated patterns to decide what to post next. Depends on SP#5 + months of data.

---

## Evaluated & Rejected

### Postiz as posting layer
**Evaluated:** 2026-03-19
**Decision:** Stay in-house
**Reasoning:** Cloud pricing ($29/mo) doesn't scale (400 post limit). Self-hosted requires Temporal (operational complexity). Our `PostingStrategy` plugin interface already supports adding platforms — each is ~100 lines. Postiz solves scheduling/management we don't need; we only need "post text + image to API."

### Canva API for visual generation
**Evaluated:** 2026-03-19
**Decision:** Not usable
**Reasoning:** Programmatic generation (Autofill API) is Enterprise-only (30+ team members, custom pricing). No public API for "send data, get image." Not relevant to our use case.

### Lightpanda as Puppeteer replacement
**Evaluated:** 2026-03-19
**Decision:** Wrong tool
**Reasoning:** Lightpanda is a headless browser for scraping/automation — it explicitly skips CSS rendering and GPU compositing. Cannot generate screenshots/images. Potentially useful for a future web-scraping data source, not for visual generation.
