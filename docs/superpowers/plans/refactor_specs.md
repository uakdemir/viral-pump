# Refactor Plan

**Date:** 2026-03-22 00:05
**Scope:** `src/` — 65 files, 4180 lines
**Reviewed by:** Codex (2026-03-22) — reclassified, refined suggestions, added 4 missed findings

---

## Implementation Scope

This document is now the implementation plan, not just the raw audit output.

- **In scope for implementation:** Pass 1 through Pass 4 below
- **Out of scope for now:** the `Deferred` section
- **Goal:** keep the work localized, remove clear dead weight, reduce the highest-value duplication, and pay down the most active type debt without changing architecture or behavior
- **Review boundary:** each pass should remain independently reviewable/stageable before moving to the next one

---

## Verification Requirements

At the end of **each pass**:

- Run `npx tsc --noEmit` — zero new TypeScript errors
- Run `npx vitest run` — existing tests still pass
- Do a targeted spot-check of the touched area

Additional pass-specific checks:

- **Pass 1:** confirm removed exports/files have zero remaining imports
- **Pass 2:** confirm extracted helpers preserve existing behavior in the original callers
- **Pass 3:** confirm new DTO/parser types remove `any` usage without widening runtime behavior
- **Pass 4:** keep changes narrowly scoped; skip any extraction that starts expanding architecture

---

## Recommended Implementation Order

### Pass 1: Safe cleanup

Findings: #1, #2, #3, #4, #5, #6

### Pass 2: High-value duplication removal

Findings: #7, #8

### Pass 3: Type debt payoff

Findings: #9, #10, #11, #12

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
**Action:** Move `htmlEscape` to `src/shared/html.ts` (or export from `template-filler.ts` with a clear name). Import in `newsletter-stub.ts`.
**Codex note:** Do not export from a "template filler" mental model without clear naming. Prefer a dedicated utility file.

---

### 6. `post-to-platform` handler bypasses registry for DryRunPostingStrategy

**Confidence:** 75/100 | **Category:** interface | **Promoted by Codex review**
**Locations:**

- `src/worker/handlers/post-to-platform.ts:7,127` — directly imports and instantiates `DryRunPostingStrategy`
- `src/worker/index.ts:77-80` — also registers `dry-run` in the posting strategy registry

**Problem:** Two code paths for dry-run: one through registry, one hardcoded. Defeats the registry pattern (ADR-002/ADR-013).
**Action:** Remove direct import. When `dryRun: true`, resolve `"dry-run"` from the posting strategy registry.
**Implementation note:** The handler already has `deps.postingStrategyRegistry` and `deps.assetDir`. Keep the current validation-before-dry-run behavior, but resolve the strategy via `deps.postingStrategyRegistry.resolve('dry-run', { outputDir: deps.assetDir + '/dry-run' })` instead of constructing `new DryRunPostingStrategy(...)` directly.

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

**Problem:** All five strategies repeat the same 4-step validation: text length, media type, MIME type, file size. Only the constants differ.
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

---

### 8. Template resolution and validation duplicated between EventDetector and Scheduler

**Confidence:** 85/100 | **Category:** DRY
**Locations:**

- `src/worker/event-detector.ts:77-83, 134-171` — validates contentConfig, resolves templates, applies RANDOM selection
- `src/worker/scheduler.ts:191-199, 215-247` — identical logic

**Problem:** ~35 lines of identical multi-step logic. Can silently diverge.
**Action:** Extract a pure helper into `src/domain/template-resolver.ts` that handles: contentConfig validation, enabled-template lookup, missing-name detection, random-vs-named selection. Returns data/result objects only.
**Codex note:** Keep side effects (logging, cooldown handling, schedule advancement) in the callers, not in the helper.
**Implementation note:** Use an explicit result shape so callers can preserve their distinct log/skip behavior, e.g.:

```ts
type TemplateResolutionResult =
  | { ok: true; selectedTemplates: ContentTemplate[] }
  | { ok: false; reason: 'invalid-content-config' }
  | { ok: false; reason: 'missing-templates'; missingNames: string[] };
```

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

---

### 10. JSONB `as any` casts — missing typed parsers/accessors (NEW — from Codex)

**Confidence:** 75/100 | **Category:** interface
**Locations:**

- `src/worker/event-detector.ts:52,74,75,94,123,124,174`
- `src/worker/scheduler.ts:92-95,185`
- `src/worker/handlers/generate-content.ts:46,61`
- `src/worker/handlers/generate-visual.ts:33-34`
- `src/plugins/visual-generators/puppeteer-html.ts:24-25`
- `src/domain/trigger-evaluator.ts`

**Problem:** JSONB columns are untyped. Every consumer casts to `any`, creating implicit contracts. One of the bigger sources of hidden runtime bugs.
**Action:** Add typed parsing helpers for: trigger rule condition, content config, vertical defaults, visual template config, account config. Prefer `unknown -> validated shape` at boundaries instead of `as any` at every use site. `RuleCondition` interface already exists in `trigger-evaluator.ts` — extend this pattern.
**Implementation note:** Keep these helpers close to the owning concern rather than creating one giant util file:

- trigger/content config parsing near the domain layer
- account/platform config parsing near posting code
- visual template config parsing near visual generation

---

### 11. Inconsistent logging — ad-hoc inline logger types

**Confidence:** 72/100 | **Category:** interface
**Locations:**

- `src/worker/job-reaper.ts:7` — `{ info }`
- `src/worker/handlers/generate-content.ts:21` — `{ info, error }`
- `src/worker/handlers/post-to-platform.ts:24-28` — `{ info, warn, error }`
- `src/worker/metrics-poller.ts:19-24` — `{ info, warn, error, debug }`
- Plus 17 plugin files importing `logger` singleton directly

**Problem:** Every worker component defines its own inline logger interface with different method subsets. Plugin logs lose worker/job context.
**Action (step 1 — types only):** Add a shared `LoggerLike` type in `src/shared/logger.ts`. Replace inline shapes in all worker deps interfaces.
**Codex note:** Defer "pass logger into every plugin" until you actively need worker/job context inside plugin logs.

---

### 12. Query-builder `any` in web routes (NEW — from Codex)

**Confidence:** 65/100 | **Category:** interface
**Locations:**

- `src/web/api/posts.ts`
- `src/web/api/content-items.ts`

**Problem:** Dynamic query building uses `conditions: any[]`, `query = query.where(...) as any`, and `(summaryResult as any)[0]`.
**Action:** Extract smaller helper functions for filters/summary mapping. Reduce `any` at the route boundary without changing behavior.

---

## Pass 4 — Optional / Smaller DRY Improvements

### 13. Content generators (OpenAI / Claude) — shared pre/post-processing

**Confidence:** 82/100 | **Category:** DRY | **Downgraded by Codex review**
**Locations:**

- `src/plugins/content-generators/openai.ts:20-43`
- `src/plugins/content-generators/claude.ts:21-48`

**Problem:** Both share identical pre-processing (prompt filling, temperature extraction) and post-processing (response parsing, output construction).
**Action:** Extract small shared helpers for prompt filling, temperature resolution, and LLM response parsing.
**Codex note:** Do NOT introduce inheritance (`BaseLlmContentGenerator`) with only two implementations. Only consider a base class if a third generator arrives.

---

### 14. Data source providers — duplicated poll pattern

**Confidence:** 75/100 | **Category:** DRY
**Locations:**

- `src/plugins/data-sources/coingecko.ts:23-75`
- `src/plugins/data-sources/exchangerate.ts:23-85`

**Problem:** Both maintain previous values, compute `changePct`, and build identical event structures.
**Action:** Extract `computeChangePct()` utility. Keep it small.
**Codex note:** Do NOT build a framework-y `PriceTracker` class unless both providers clearly want the same lifecycle.

---

### 15. `fetch` + error handling pattern duplicated 8+ times

**Confidence:** 72/100 | **Category:** DRY
**Locations:** `instagram-api.ts`, `linkedin-api.ts`, `pinterest-api.ts`, `telegram-api.ts`, `twitter.ts` (metrics), `instagram.ts` (metrics)

**Problem:** `if (!res.ok) { const err = await res.text(); throw new Error(...) }` appears 8+ times.
**Action:** Extract a small `assertOk(res, errorPrefix)` or `readErrorText(res)` helper.
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
