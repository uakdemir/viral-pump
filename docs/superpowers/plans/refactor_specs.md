# Refactor Plan

**Date:** 2026-03-22 00:05
**Scope:** `src/` — 74 source files (`.ts` / `.tsx` / `.js` / `.jsx`), 4984 lines
**Reviewed by:** Codex (2026-03-22) — reclassified, refined suggestions, added 4 missed findings

---

## Implementation Scope

This document is now the implementation plan, not just the raw audit output.

- **In scope for implementation:** Pass 1 through Pass 3 below; Pass 4 is lower priority and only worth doing if the payoff stays obviously small
- **Out of scope for now:** the `Deferred` section
- **Goal:** keep the work localized, remove clear dead weight, reduce the highest-value duplication, and pay down the most active type debt without changing architecture or behavior
- **Review boundary:** each pass should remain independently reviewable/stageable before moving to the next one
- **Commit guidance:** prefer one small commit per finding in Pass 1 when the change is trivial; for Pass 2+ prefer one commit per finding or tightly-coupled helper/caller pair

---

## Verification Requirements

At the end of **each pass**:

- Run `npx tsc --noEmit` — zero new TypeScript errors
- Run `npx vitest run` — existing tests still pass
- Do a targeted spot-check of the touched area
- If a finding breaks verification, fix it before continuing or revert that finding individually; do not carry a broken partial pass forward

Additional pass-specific checks:

- **Pass 1:** confirm removed exports/files have zero remaining imports with `rg -n -w 'fetchPosts|fetchContentItems' src/ -g '*.ts' -g '*.tsx'`; check `router.ts` references separately with `rg -n "from .*router\\.js" src/ -g '*.ts' -g '*.tsx'`; verify `DryRunPostingStrategy` no longer appears in `src/worker/handlers/post-to-platform.ts`
- **Pass 2:** confirm extracted helpers preserve existing behavior with concrete tests: run `npx vitest run tests/plugins/posting-strategies/` for #7, and run `npx vitest run tests/domain/template-resolver.test.ts` for #8
- **Pass 3:** confirm new DTO/parser types remove `any` usage without widening runtime behavior
- **Pass 4:** keep changes narrowly scoped; skip any extraction that starts expanding architecture

---

## Recommended Implementation Order

### Pass 1: Safe cleanup

Findings: #1, #2, #3, #4, #5, #6

Pure deletions: #1, #2, #3, #4
Small localized extractions / rewires: #5, #6

### Pass 2: High-value duplication removal

Findings: #7, #8

### Pass 3: Type debt payoff

Findings: #9, #10, #11, #12

Recommended order within Pass 3: #12 -> #9 -> #10 -> #11

### Pass 4: Optional / smaller DRY improvements

Findings: #13, #14, #15

---

## Pass 1 — Safe Cleanup

### 1. `router.ts` is a dead file

**Confidence:** 95/100 | **Category:** dead-weight
**Location:** `src/web/api/router.ts:1-2`

**Problem:** File contains only a comment. Zero imports found anywhere.
**Action:** Delete the file. If a route aggregator is wanted later, create a real `registerApiRoutes()` abstraction.

---

### 2. Unused `logger` imports in two plugin files

**Confidence:** 90/100 | **Category:** dead-weight
**Locations:**

- `src/plugins/content-generators/claude.ts:5`
- `src/plugins/visual-generators/puppeteer-html.ts:6`

**Problem:** Dead imports.
**Action:** Remove both import lines.
**Implementation note:** Before deleting, confirm with `rg -n 'logger\\.' src/plugins/content-generators/claude.ts src/plugins/visual-generators/puppeteer-html.ts` that no call sites remain beyond the import line.

---

### 3. `fetchPosts` function superseded and unused

**Confidence:** 85/100 | **Category:** dead-weight
**Location:** `src/web/dashboard/src/api.ts:39`

**Problem:** `fetchPostsWithFilters` does everything `fetchPosts` does. No component imports `fetchPosts`.
**Action:** Delete `fetchPosts`.

---

### 4. `fetchContentItems` function unused

**Confidence:** 85/100 | **Category:** dead-weight
**Location:** `src/web/dashboard/src/api.ts:9`

**Problem:** `ReviewQueue.tsx` imports `fetchPendingContent` instead. No file imports `fetchContentItems`.
**Action:** Delete `fetchContentItems`.

---

### 5. HTML escape function duplicated

**Confidence:** 85/100 | **Category:** DRY
**Locations:**

- `src/shared/template-filler.ts:10-16` — `htmlEscape()` (private)
- `src/plugins/posting-strategies/newsletter-stub.ts:7-13` — `esc()` identical logic

**Problem:** Character-for-character identical functions.
**Action:** Move `htmlEscape` to `src/shared/html.ts`. Import it in both `template-filler.ts` and `newsletter-stub.ts`.
**Codex note:** Prefer a dedicated utility file over exporting from a "template filler" mental model.
**Implementation note:** In `template-filler.ts`, delete the private `htmlEscape` function and replace it with `import { htmlEscape } from './html.js';`. The `fill()` call sites stay the same.

---

### 6. `post-to-platform` handler bypasses registry for DryRunPostingStrategy

**Confidence:** 75/100 | **Category:** interface | **Promoted by Codex review**
**Locations:**

- `src/worker/handlers/post-to-platform.ts:7,127` — directly imports and instantiates `DryRunPostingStrategy`
- `src/worker/index.ts:77-80` — also registers `dry-run` in the posting strategy registry

**Problem:** Two code paths for dry-run: one through registry, one hardcoded. Defeats the registry pattern (ADR-002/ADR-013).
**Action:** Remove direct import. When `dryRun: true`, resolve `"dry-run"` from the posting strategy registry.
**Implementation note:** The handler already has `deps.postingStrategyRegistry` and `deps.assetDir`. Make the flow explicit:

1. Resolve the real platform strategy from the registry for `validateInput()`.
2. Validate input against the real platform strategy.
3. If `isDryRun`, resolve `'dry-run'` with `{ outputDir: deps.assetDir + '/dry-run' }` and call `.post()` on that strategy.
4. Otherwise call `.post()` on the real platform strategy.

Do **not** pass the real `strategyConfig` into the dry-run resolve call.
Also remove the direct `DryRunPostingStrategy` import from `src/worker/handlers/post-to-platform.ts`.

---

## Pass 2 — High-Value DRY Extractions

### 7. Posting strategy `validateInput` — identical validation pattern x5

**Confidence:** 88/100 | **Category:** DRY
**Locations:**

- `src/plugins/posting-strategies/twitter-api.ts:43-66`
- `src/plugins/posting-strategies/instagram-api.ts:21-58`
- `src/plugins/posting-strategies/linkedin-api.ts:22-42`
- `src/plugins/posting-strategies/telegram-api.ts:22-43`
- `src/plugins/posting-strategies/pinterest-api.ts:18-51`

**Problem:** All five strategies share the same core 4-step validation: text length, media type, MIME type, file size. Platform-specific extensions still exist on top (required media, aspect ratio, boardId, min width).
**Action:** Create `validatePostInput(input, constraints: PlatformConstraints)` in a new `src/plugins/posting-strategies/validation.ts`. Each strategy calls it with its constraints, then adds platform-specific checks (aspect ratio, boardId) locally.
**Codex note:** Keep `types.ts` for interfaces/types only. Do not put the helper there.
**Implementation note:** Define the shared constraint shape up front, for example:

```ts
interface PlatformConstraints {
  platformName: string;
  maxTextLength: number;
  maxFileSizeBytes?: number;
  allowedMediaTypes?: MediaInput['type'][];
  allowedMimeTypes?: string[];
  requiresMedia?: boolean;
}
```

Keep requirements like Instagram aspect ratio and Pinterest `boardId` / min width outside the shared helper.
When `requiresMedia` is true and media is absent, throw `${platformName} requires media`. When `requiresMedia` is false but media is present, `allowedMediaTypes` and `allowedMimeTypes` still apply.
Twitter can express GIF support through `allowedMediaTypes: ['image', 'gif']`; "platform-specific" here means validations beyond those constraints.
Keep all existing tests in `tests/plugins/posting-strategies/validators.test.ts` unchanged as regression guards, and add new helper coverage in `tests/plugins/posting-strategies/validation.test.ts` for text length, media type, MIME type, file size, and `requiresMedia`.

---

### 8. Template resolution and validation duplicated between EventDetector and Scheduler

**Confidence:** 85/100 | **Category:** DRY
**Locations:**

- `src/worker/event-detector.ts:77-83, 134-171` — validates contentConfig, resolves templates, applies RANDOM selection
- `src/worker/scheduler.ts:191-199, 215-247` — identical logic

**Problem:** ~35 lines of identical multi-step logic. Can silently diverge.
**Action:** Extract a pure helper into `src/domain/template-resolver.ts` that handles: contentConfig validation, missing-name detection, and random-vs-named selection on a caller-supplied enabled-template list. Returns data/result objects only.
**Codex note:** Keep side effects (logging, cooldown handling, schedule advancement) in the callers, not in the helper.
**Implementation note:** Use an explicit result shape so callers can preserve their distinct log/skip behavior, e.g.:

```ts
type EnabledTemplate = typeof contentTemplates.$inferSelect;

type TemplateResolutionResult =
  | { ok: true; selectedTemplates: EnabledTemplate[] }
  | { ok: false; reason: 'invalid-content-config' }
  | { ok: false; reason: 'missing-templates'; missingNames: string[] };
```

Use a concrete signature such as `resolveTemplates(contentConfig: ContentConfig, enabledTemplates: EnabledTemplate[]): TemplateResolutionResult`.
Both callers fetch enabled templates first (EventDetector via `this.deps.db`, Scheduler via `tx`) and then pass only the validated `contentConfig` value plus template rows into the helper so the helper stays genuinely pure, regardless of whether the source row used `contentConfig` or `content_config`.
Preserve current behavior where any non-`RANDOM` selection mode returns all resolved templates.
Add a focused `tests/domain/template-resolver.test.ts` before wiring both callers, and keep it green as the main regression guard for this extraction.

---

## Pass 3 — Type Debt Payoff

### 9. Dashboard `any` usage — missing shared DTO types (NEW — from Codex)

**Confidence:** 78/100 | **Category:** interface
**Locations:**

- `src/web/dashboard/src/pages/ReviewQueue.tsx`
- `src/web/dashboard/src/pages/PostMonitor.tsx`
- `src/web/dashboard/src/pages/VerticalManagement.tsx`
- `src/web/dashboard/src/components/MetricsChart.tsx`
- `src/web/dashboard/src/components/ContentCard.tsx`

**Problem:** Active maintenance debt. Dashboard components use untyped API responses, obscuring contracts and making UI regressions easier.
**Action:** Define response DTOs in a shared file such as `src/web/dashboard/src/api-types.ts`. Type `fetchPendingContent`, `fetchPostsWithFilters`, `fetchVerticals`, `fetchMetricsHistory` return values, then flow those types into `ReviewQueue`, `PostMonitor`, `VerticalManagement`, `MetricsChart`, and `ContentCard`.
**Implementation note:** Derive the DTOs from the actual server route shapes in `src/web/api/posts.ts` and `src/web/api/content-items.ts`. Model `/api/posts` explicitly as a polymorphic response: either a bare array or `{ items, summary }` when summary mode is requested.
**Acceptance criteria:** replace the current `useState<any[]>` / `useState<any>` state in the dashboard pages with typed state, cover all fields accessed in JSX, reduce `any` usage in `src/web/dashboard/src/` by at least five occurrences, and remove API-response-driven `any` usage from `MetricsChart.tsx` and `ContentCard.tsx` for the fields touched by this pass.

---

### 10. JSONB `as any` casts — missing typed parsers/accessors (NEW — from Codex)

**Confidence:** 75/100 | **Category:** interface
**Locations:**

- `src/worker/event-detector.ts:52,74,75,123,124,174`
- `src/worker/scheduler.ts:92-95,185`
- `src/worker/handlers/generate-content.ts:46,61`
- `src/worker/handlers/generate-visual.ts:33-34`
- `src/plugins/visual-generators/puppeteer-html.ts:24-25`

**Problem:** JSONB columns are untyped. Every consumer casts to `any`, creating implicit contracts. One of the bigger sources of hidden runtime bugs.
**Action:** Add typed parsing helpers for: trigger rule condition, content config, vertical defaults, visual template config, account config. Prefer `unknown -> validated shape` at boundaries instead of `as any` at every use site. `RuleCondition` interface already exists in `trigger-evaluator.ts` — extend this pattern.
**Implementation note:** Keep these helpers close to the owning concern rather than creating one giant util file:

- trigger/content config parsing near the domain layer
- account/platform config parsing near posting code
- visual template config parsing near visual generation

Use concrete homes such as `src/domain/config-parsers.ts` for trigger/content config and `src/plugins/visual-generators/config-parser.ts` for visual template config. Follow the existing `validateContentConfig()` type-guard pattern where possible.
Treat this as three small sub-slices rather than one sweep: (10a) trigger/content config, (10b) visual template config, (10c) account/platform config. Keep non-JSONB casts such as `rule.fireMode as any` out of this finding; if addressed, handle them as schema or enum typing separately.

---

### 11. Inconsistent logging — ad-hoc inline logger types

**Confidence:** 72/100 | **Category:** interface
**Locations:**

- `src/worker/job-reaper.ts:7` — `{ info }`
- `src/worker/event-detector.ts:29` — `{ info, warn, error }`
- `src/worker/scheduler.ts:27` — `{ info, warn, error }`
- `src/worker/handlers/generate-content.ts:21` — `{ info, error }`
- `src/worker/handlers/generate-visual.ts:13` — `{ info, error }`
- `src/worker/handlers/post-to-platform.ts:24-28` — `{ info, warn, error }`
- `src/worker/metrics-poller.ts:19-24` — `{ info, warn, error, debug }`
- Plus 15+ plugin files importing `logger` singleton directly (17 pre-cleanup, 15 after Pass 1)

**Problem:** Every worker component defines its own inline logger interface with different method subsets. Plugin logs lose worker/job context.
**Action (step 1 — types only):** Add a shared `LoggerLike` type in `src/shared/logger.ts`. Replace inline shapes in all worker deps interfaces.
**Implementation note:** Use a small superset type, e.g. `type LoggerLike = { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void; debug?: (...args: unknown[]) => void }`.
**Codex note:** Defer "pass logger into every plugin" until you actively need worker/job context inside plugin logs.

---

### 12. Query-builder `any` in web routes (NEW — from Codex)

**Confidence:** 65/100 | **Category:** interface
**Locations:**

- `src/web/api/posts.ts`
- `src/web/api/content-items.ts`

**Problem:** Dynamic query building uses `conditions: any[]`, `query = query.where(...) as any`, and `(summaryResult as any)[0]`.
**Action:** Extract smaller helper functions for filters and summary mapping. Reduce `any` at the route boundary without changing behavior.
**Implementation note:** Use `SQLWrapper[]` from `drizzle-orm` for collected conditions, build a single `and(...conditions)` clause, and apply it in one `.where()` call. Replace `(summaryResult as any)[0]` with a small typed row shape for the summary query.

---

## Pass 4 — Optional / Smaller DRY Improvements

### 13. Content generators (OpenAI / Claude) — shared pre/post-processing

**Confidence:** 82/100 | **Category:** DRY | **Downgraded by Codex review**
**Locations:**

- `src/plugins/content-generators/openai.ts:20-43`
- `src/plugins/content-generators/claude.ts:21-48`

**Problem:** Most of the real sharing is already handled by imported helpers. The remaining overlap is mainly temperature defaulting and small request-shaping glue, while response extraction differs materially by provider.
**Action:** Keep this extremely small: only extract a helper if it removes obvious noise without hiding provider-specific response handling. Temperature default resolution is the best candidate; shared response parsing is out of scope here.
**Codex note:** Do NOT introduce inheritance (`BaseLlmContentGenerator`) with only two implementations. Only consider a base class if a third generator arrives.

---

### 14. Data source providers — duplicated poll pattern

**Confidence:** 75/100 | **Category:** DRY
**Locations:**

- `src/plugins/data-sources/coingecko.ts:23-75`
- `src/plugins/data-sources/exchangerate.ts:23-85`

**Problem:** Both maintain previous values, compute `changePct`, and build identical event structures.
**Action:** Extract `computeChangePct()` only if both providers can share the same zero/null semantics without extra conditionals; otherwise skip this as low-ROI cleanup.
**Codex note:** Do NOT build a framework-y `PriceTracker` class unless both providers clearly want the same lifecycle.

---

### 15. `fetch` + error handling pattern duplicated 8+ times

**Confidence:** 72/100 | **Category:** DRY
**Locations:**

- `src/plugins/posting-strategies/instagram-api.ts`
- `src/plugins/posting-strategies/linkedin-api.ts`
- `src/plugins/posting-strategies/pinterest-api.ts`
- `src/plugins/posting-strategies/telegram-api.ts`
- `src/plugins/metrics-collectors/twitter.ts`

**Problem:** `if (!res.ok) { const err = await res.text(); throw new Error(...) }` appears repeatedly in several posting strategies and the Twitter metrics collector. Data source providers use a different `warn + return []` pattern, and the Instagram metrics collector has bespoke multi-status handling, so neither should be forced through the same helper.
**Action:** If this stays in scope, extract only a minimal `readErrorText(res)` or similarly small helper for posting strategies and metrics collectors. Do not force data source providers into the same abstraction.
**Codex note:** Do NOT build a generic `fetchOrThrow` wrapper. Different integrations want different error text, retry semantics, and logging. Keep the helper minimal.

---

## Deferred — Do Not Implement Now

### D1. `DetectedEventSchema` Zod schema

**Original:** #3 (Critical, 90/100)
**Codex verdict:** Defer. The schema is dead-ish but not harmful. Keep for future boundary validation, or start using it at ingress points. Only convert to plain interface if runtime validation is explicitly out of scope.

### D2. `config.LLM_PROVIDER`

**Original:** #9 (Critical, 85/100)
**Codex verdict:** Safe to remove only if the same change also updates `.env.example` and any spec docs that mention it. Low-risk cleanup but do it as docs+config together in Pass 4.

### D3. `config.AUTH_SECRET`

**Original:** #10 (Critical, 85/100)
**Codex verdict:** Defer. Unused in code, but still part of the operator-facing env contract. Architecture doc expects MVP auth. Remove only when auth direction is explicitly decided.

### D4. `POST_STATUS.SKIPPED`

**Original:** #11 (Critical, 85/100)
**Codex verdict:** Defer. Unused in code but still appears in docs/data-model references. Removing is a docs+model cleanup, not just dead-code cleanup.

### D5. `JobQueue` interface relocation (domain -> plugin dependency)

**Original:** #13 (Critical, 82/100)
**Codex verdict:** Deprioritize. Code depends on the interface, not a concrete implementation. Mild layering smell but not the highest-value refactor.

### D6. `cardStyle` CSS duplication

**Original:** #14 (Critical, 80/100)
**Codex verdict:** Low priority. Fine cleanup if already doing dashboard polish, not worth a standalone pass.

### D7. `MediaInput.additionalPaths`

**Original:** #15 (Critical, 80/100)
**Codex verdict:** Low priority. Speculative but harmless. If removed, do it together with a clear statement that carousel support is not planned near-term.

### D8. `MediaInput.durationMs`

**Original:** #18 (Important, 75/100)
**Codex verdict:** **KEEP.** ADR-013 explicitly includes media duration in `PostInput`. This field is part of the accepted architecture for future video strategies.

### D9. `PluginRegistry` config generics (NEW — from Codex)

**Confidence:** 55/100 | **Category:** interface
**Location:** `src/plugins/registry.ts`
**Problem:** `config: any` leaks everywhere and weakens otherwise clean plugin boundaries.
**Codex verdict:** Consider `PluginRegistry<T, C = unknown>`. Only do this if migration stays local. Do not let it become a repo-wide type fight.

---

## Codebase Health Summary

The codebase is well-structured for its maturity — clean module boundaries between `web/`, `worker/`, `plugins/`, `domain/`, and `shared/`, no circular dependencies, and consistent plugin registry patterns.

**Top risks by ROI:**

1. **Accumulated dead code** — 6 items that can be cleaned up in one safe pass (#1-#6)
2. **Posting strategy validation duplication** — highest-impact DRY violation with 5 near-identical implementations (#7)
3. **Template resolution duplication** — silent divergence risk between EventDetector and Scheduler (#8)
4. **Type debt** — dashboard `any` usage and JSONB `as any` casts are growing structural debt (#9, #10)

**Biggest "do not over-refactor" traps** (per Codex review):

- Deleting documented contract fields too early (`AUTH_SECRET`, `POST_STATUS.SKIPPED`, `MediaInput.durationMs`)
- Introducing inheritance for only two LLM generators
- Over-generalizing HTTP helpers
- Moving interfaces across layers without concrete payoff
