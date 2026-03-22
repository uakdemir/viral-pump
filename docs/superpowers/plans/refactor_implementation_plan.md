# Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead code, extract duplicated validation and template resolution logic, and reduce `any` usage — without changing architecture or behavior.

**Architecture:** Four sequential passes of increasing complexity. Pass 1 is pure deletion + small rewiring. Pass 2 extracts two shared helpers with TDD. Pass 3 introduces typed interfaces to replace `any`. Pass 4 is optional micro-extractions.

**Tech Stack:** TypeScript, Drizzle ORM, Vitest, Fastify, React

**Source spec:** `docs/superpowers/plans/refactor_specs.md`

---

## Task 1: Delete dead `router.ts` (Pass 1, Finding #1)

**Files:**

- Delete: `src/web/api/router.ts`

- [ ] **Step 1: Verify zero imports**

Run: `rg -n "from .*router\.js" src/ -g '*.ts' -g '*.tsx'`
Expected: Zero matches

- [ ] **Step 2: Delete the file**

```bash
rm src/web/api/router.ts
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS with zero errors

- [ ] **Step 4: Stage**

```bash
git add src/web/api/router.ts
```

Suggested commit: `refactor: delete dead router.ts placeholder`

---

## Task 2: Remove unused `logger` imports (Pass 1, Finding #2)

**Files:**

- Modify: `src/plugins/content-generators/claude.ts:5`
- Modify: `src/plugins/visual-generators/puppeteer-html.ts:6`

- [ ] **Step 1: Verify logger is unused in both files**

Run: `rg -n 'logger\.' src/plugins/content-generators/claude.ts src/plugins/visual-generators/puppeteer-html.ts`
Expected: Zero matches (only the import lines exist)

- [ ] **Step 2: Remove the import from `claude.ts`**

Delete line 5: `import { logger } from '../../shared/logger.js';`

- [ ] **Step 3: Remove the import from `puppeteer-html.ts`**

Delete line 6: `import { logger } from '../../shared/logger.js';`

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Stage**

```bash
git add src/plugins/content-generators/claude.ts src/plugins/visual-generators/puppeteer-html.ts
```

Suggested commit: `refactor: remove unused logger imports from claude.ts and puppeteer-html.ts`

---

## Task 3: Delete unused `fetchPosts` and `fetchContentItems` (Pass 1, Findings #3 + #4)

**Files:**

- Modify: `src/web/dashboard/src/api.ts`

- [ ] **Step 1: Verify zero imports**

Run: `rg -n -w 'fetchPosts|fetchContentItems' src/web/dashboard/src/ -g '*.ts' -g '*.tsx'`
Expected: Only the definition lines in `api.ts` (lines 9 and 39). No imports in any component.

- [ ] **Step 2: Delete `fetchContentItems` (lines 9-13)**

Remove the entire function:

```ts
export async function fetchContentItems(status?: string) {
  const qs = status ? `?status=${status}` : '';
  const res = await fetch(`${BASE}/api/content-items${qs}`);
  return res.json();
}
```

- [ ] **Step 3: Delete the `fetchPosts` function (shifted down after step 2)**

Remove the entire function:

```ts
export async function fetchPosts(status?: string) {
  const qs = status ? `?status=${status}` : '';
  const res = await fetch(`${BASE}/api/posts${qs}`);
  return res.json();
}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Verify no remaining references**

Run: `rg -n -w 'fetchPosts|fetchContentItems' src/web/dashboard/src/ -g '*.ts' -g '*.tsx'`
Expected: Zero matches

- [ ] **Step 6: Stage**

```bash
git add src/web/dashboard/src/api.ts
```

Suggested commit: `refactor: remove unused fetchPosts and fetchContentItems from dashboard api`

---

## Task 4: Extract `htmlEscape` to shared utility (Pass 1, Finding #5)

**Files:**

- Create: `src/shared/html.ts`
- Modify: `src/shared/template-filler.ts:10-16`
- Modify: `src/plugins/posting-strategies/newsletter-stub.ts:7-13`

- [ ] **Step 1: Create `src/shared/html.ts`**

```ts
export function htmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

- [ ] **Step 2: Update `template-filler.ts`**

Delete only the private `htmlEscape` function (lines 10-16). Keep `resolvePath` (lines 1-8) and `fill` (line 18+) untouched. Add the import at the top:

```ts
import { htmlEscape } from './html.js';
```

The `fill()` function on line 18 (now shifted) still calls `htmlEscape(str)` — no change needed there.

- [ ] **Step 3: Update `newsletter-stub.ts`**

Delete the private `esc` function (lines 7-13) and add the import:

```ts
import { htmlEscape } from '../../shared/html.js';
```

Replace all usages of `esc(` with `htmlEscape(` in the file.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: All tests pass (existing tests for `fillHtmlTemplate` and newsletter-stub cover this indirectly)

- [ ] **Step 6: Verify only one copy remains**

Run: `rg -n 'function htmlEscape|function esc' src/ -g '*.ts'`
Expected: Only `src/shared/html.ts` matches

- [ ] **Step 7: Stage**

```bash
git add src/shared/html.ts src/shared/template-filler.ts src/plugins/posting-strategies/newsletter-stub.ts
```

Suggested commit: `refactor: extract htmlEscape to src/shared/html.ts, deduplicate newsletter-stub`

---

## Task 5: Route dry-run through posting strategy registry (Pass 1, Finding #6)

**Files:**

- Modify: `src/worker/handlers/post-to-platform.ts:7,124-142`

- [ ] **Step 1: Remove the direct `DryRunPostingStrategy` import**

In `src/worker/handlers/post-to-platform.ts`, delete line 7:

```ts
import { DryRunPostingStrategy } from '../../plugins/posting-strategies/dry-run.js';
```

- [ ] **Step 2: Replace the direct instantiation with registry resolution**

Replace only line 127 — the `new DryRunPostingStrategy(...)` call:

```ts
// Before (line 127):
const dryRunStrategy = new DryRunPostingStrategy({ outputDir: deps.assetDir + '/dry-run' });

// After:
const dryRunStrategy = deps.postingStrategyRegistry.resolve('dry-run', {
  outputDir: deps.assetDir + '/dry-run',
});
```

Everything else in the `isDryRun` block (lines 124-142) stays unchanged.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Verify no direct DryRunPostingStrategy reference remains**

Run: `rg -n 'DryRunPostingStrategy' src/worker/handlers/post-to-platform.ts`
Expected: Zero matches

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Stage**

```bash
git add src/worker/handlers/post-to-platform.ts
```

Suggested commit: `refactor: resolve dry-run strategy via registry instead of direct import`

---

## Task 6: Pass 1 verification checkpoint

- [ ] **Step 1: Full build check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Final dead-code grep**

Run: `rg -n -w 'fetchPosts|fetchContentItems' src/ -g '*.ts' -g '*.tsx'`
Expected: Zero matches (`-w` enforces whole-word matching, so `fetchPostsWithFilters` will not match)

Run: `rg -n "from .*router\.js" src/ -g '*.ts'`
Expected: Zero matches

Run: `rg -n 'DryRunPostingStrategy' src/worker/handlers/post-to-platform.ts`
Expected: Zero matches

---

## Task 7: Write `validatePostInput` tests (Pass 2, Finding #7 — TDD red)

**Files:**

- Create: `tests/plugins/posting-strategies/validation.test.ts`
- Create: `src/plugins/posting-strategies/validation.ts` (in next task)

- [ ] **Step 1: Write the failing test file**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/plugins/posting-strategies/validation.test.ts`
Expected: FAIL — `validatePostInput` is not found (module doesn't exist)

---

## Task 8: Implement `validatePostInput` (Pass 2, Finding #7 — TDD green)

**Files:**

- Create: `src/plugins/posting-strategies/validation.ts`

- [ ] **Step 1: Write the implementation**

```ts
import type { PostInput, MediaInput } from './types.js';

export interface PlatformConstraints {
  platformName: string;
  maxTextLength: number;
  maxFileSizeBytes?: number;
  maxFileSizeLabel?: string; // e.g. '5 MB' — used in error messages to match existing test assertions
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
```

- [ ] **Step 2: Run new tests**

Run: `npx vitest run tests/plugins/posting-strategies/validation.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 3: Run existing strategy tests as regression guard**

Run: `npx vitest run tests/plugins/posting-strategies/validators.test.ts`
Expected: All existing tests PASS (we haven't changed any strategy yet)

- [ ] **Step 4: Stage**

```bash
git add src/plugins/posting-strategies/validation.ts tests/plugins/posting-strategies/validation.test.ts
```

Suggested commit: `feat: add shared validatePostInput helper with tests`

---

## Task 9: Wire strategies to use `validatePostInput` (Pass 2, Finding #7 — refactor)

**Files:**

- Modify: `src/plugins/posting-strategies/twitter-api.ts:43-66`
- Modify: `src/plugins/posting-strategies/instagram-api.ts:21-58`
- Modify: `src/plugins/posting-strategies/linkedin-api.ts:22-42`
- Modify: `src/plugins/posting-strategies/telegram-api.ts:22-43`
- Modify: `src/plugins/posting-strategies/pinterest-api.ts:18-51`

- [ ] **Step 1: Refactor `twitter-api.ts` validateInput**

Add import: `import { validatePostInput } from './validation.js';`

Replace the `validateInput` method body with:

```ts
  validateInput(input: PostInput): void {
    validatePostInput(input, {
      platformName: 'Twitter',
      maxTextLength: MAX_TEXT_LENGTH,
      maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
      maxFileSizeLabel: '5 MB',
      allowedMediaTypes: ['image', 'gif'],
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif'],
    });
  }
```

- [ ] **Step 2: Refactor `instagram-api.ts` validateInput**

Add import: `import { validatePostInput } from './validation.js';`

Replace with shared helper + platform-specific checks:

```ts
  validateInput(input: PostInput): void {
    validatePostInput(input, {
      platformName: 'Instagram',
      maxTextLength: MAX_TEXT_LENGTH,
      maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
      maxFileSizeLabel: '8 MB',
      requiresMedia: true,
      allowedMediaTypes: ['image'],
      allowedMimeTypes: ['image/jpeg', 'image/png'],
    });

    // Platform-specific: aspect ratio check
    if (input.media && input.media.width && input.media.height) {
      const ratio = input.media.width / input.media.height;
      const validRatios = [1, 4 / 5, 16 / 9];
      const isValid = validRatios.some(r => Math.abs(ratio - r) / r < 0.05);
      if (!isValid) {
        throw new Error(
          `Instagram requires 1:1, 4:5, or 16:9 aspect ratio (got ${ratio.toFixed(2)})`,
        );
      }
    }
  }
```

- [ ] **Step 3: Refactor `linkedin-api.ts`**

Add import: `import { validatePostInput } from './validation.js';`

Replace the `validateInput` method body with:

```ts
  validateInput(input: PostInput): void {
    validatePostInput(input, {
      platformName: 'LinkedIn',
      maxTextLength: MAX_TEXT_LENGTH,       // 3000
      maxFileSizeBytes: MAX_FILE_SIZE_BYTES, // 5 MB
      maxFileSizeLabel: '5 MB',
      allowedMediaTypes: ['image'],
      allowedMimeTypes: ['image/jpeg', 'image/png'],
    });
  }
```

- [ ] **Step 4: Refactor `telegram-api.ts`**

Add import: `import { validatePostInput } from './validation.js';`

Replace the `validateInput` method body with:

```ts
  validateInput(input: PostInput): void {
    validatePostInput(input, {
      platformName: 'Telegram',
      maxTextLength: MAX_TEXT_LENGTH,       // 4096
      maxFileSizeBytes: MAX_FILE_SIZE_BYTES, // 10 MB
      maxFileSizeLabel: '10 MB',
      allowedMediaTypes: ['image'],
      allowedMimeTypes: ['image/jpeg', 'image/png'],
    });
  }
```

- [ ] **Step 5: Refactor `pinterest-api.ts`**

Add import: `import { validatePostInput } from './validation.js';`

Replace the `validateInput` method body with shared + platform-specific checks:

```ts
  validateInput(input: PostInput): void {
    validatePostInput(input, {
      platformName: 'Pinterest',
      maxTextLength: MAX_TEXT_LENGTH,       // 500
      maxFileSizeBytes: MAX_FILE_SIZE_BYTES, // 20 MB
      maxFileSizeLabel: '20 MB',
      requiresMedia: true,
      allowedMediaTypes: ['image'],
      allowedMimeTypes: ['image/jpeg', 'image/png'],
    });

    // Platform-specific: boardId required
    if (!input.platformMeta?.boardId) {
      throw new Error('Pinterest requires platformMeta.boardId');
    }

    // Platform-specific: minimum width
    if (input.media && input.media.width && input.media.width < 600) {
      throw new Error(`Pinterest requires minimum image width of 600px (got ${input.media.width}px)`);
    }
  }
```

- [ ] **Step 6: Run ALL strategy tests**

Run: `npx vitest run tests/plugins/posting-strategies/`
Expected: All tests PASS (both `validators.test.ts` and `validation.test.ts`)

- [ ] **Step 7: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 8: Stage**

```bash
git add src/plugins/posting-strategies/twitter-api.ts src/plugins/posting-strategies/instagram-api.ts src/plugins/posting-strategies/linkedin-api.ts src/plugins/posting-strategies/telegram-api.ts src/plugins/posting-strategies/pinterest-api.ts
```

Suggested commit: `refactor: wire 5 posting strategies to shared validatePostInput helper`

---

## Task 10: Write `resolveTemplates` tests (Pass 2, Finding #8 — TDD red)

**Files:**

- Create: `tests/domain/template-resolver.test.ts`
- Create: `src/domain/template-resolver.ts` (in next task)

- [ ] **Step 1: Write the failing test file**

```ts
import { describe, it, expect } from 'vitest';
import { resolveTemplates } from '../../src/domain/template-resolver.js';

// Minimal template shape matching contentTemplates.$inferSelect
const makeTemplate = (name: string) => ({
  id: `id-${name}`,
  name,
  verticalId: 'v1',
  category: 'alert',
  contentLayer: 'text+image',
  platform: null,
  promptTemplate: 'test',
  visualTemplate: {},
  platformMeta: {},
  generationConfig: {},
  tags: [],
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('resolveTemplates', () => {
  it('returns selected templates when all names found (named mode)', () => {
    const templates = [makeTemplate('a'), makeTemplate('b'), makeTemplate('c')];
    const result = resolveTemplates(
      { templateNames: ['a', 'b'], templateSelection: 'named' },
      templates,
    );
    expect(result).toEqual({
      ok: true,
      selectedTemplates: [templates[0], templates[1]],
    });
  });

  it('returns one random template when selection is RANDOM', () => {
    const templates = [makeTemplate('a'), makeTemplate('b')];
    const result = resolveTemplates(
      { templateNames: ['a', 'b'], templateSelection: 'random' },
      templates,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selectedTemplates).toHaveLength(1);
      expect(['a', 'b']).toContain(result.selectedTemplates[0].name);
    }
  });

  it('returns missing-templates error when configured names not found', () => {
    const templates = [makeTemplate('a')];
    const result = resolveTemplates(
      { templateNames: ['a', 'missing'], templateSelection: 'named' },
      templates,
    );
    expect(result).toEqual({
      ok: false,
      reason: 'missing-templates',
      missingNames: ['missing'],
    });
  });

  it('returns invalid-content-config when contentConfig is invalid', () => {
    const result = resolveTemplates(null as any, []);
    expect(result).toEqual({ ok: false, reason: 'invalid-content-config' });
  });

  it('returns invalid-content-config when templateNames is missing', () => {
    const result = resolveTemplates({ templateSelection: 'named' } as any, []);
    expect(result).toEqual({ ok: false, reason: 'invalid-content-config' });
  });

  it('returns all resolved templates when selection is not RANDOM', () => {
    const templates = [makeTemplate('x'), makeTemplate('y')];
    const result = resolveTemplates(
      { templateNames: ['x', 'y'], templateSelection: 'named' },
      templates,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selectedTemplates).toHaveLength(2);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/template-resolver.test.ts`
Expected: FAIL — module not found

---

## Task 11: Implement `resolveTemplates` (Pass 2, Finding #8 — TDD green)

**Files:**

- Create: `src/domain/template-resolver.ts`

- [ ] **Step 1: Write the implementation**

```ts
import { contentTemplates } from '../shared/schema/content-templates.js';
import { TEMPLATE_SELECTION } from '../shared/constants.js';
import { validateContentConfig, type ContentConfig } from './trigger-evaluator.js';

type EnabledTemplate = typeof contentTemplates.$inferSelect;

export type TemplateResolutionResult =
  | { ok: true; selectedTemplates: EnabledTemplate[] }
  | { ok: false; reason: 'invalid-content-config' }
  | { ok: false; reason: 'missing-templates'; missingNames: string[] };

export function resolveTemplates(
  contentConfig: ContentConfig,
  enabledTemplates: EnabledTemplate[],
): TemplateResolutionResult {
  if (!validateContentConfig(contentConfig)) {
    return { ok: false, reason: 'invalid-content-config' };
  }

  const resolvedTemplates = enabledTemplates.filter(t =>
    contentConfig.templateNames.includes(t.name),
  );

  const resolvedNames = new Set(resolvedTemplates.map(t => t.name));
  const missingNames = contentConfig.templateNames.filter(n => !resolvedNames.has(n));

  if (missingNames.length > 0) {
    return { ok: false, reason: 'missing-templates', missingNames };
  }

  if (
    contentConfig.templateSelection === TEMPLATE_SELECTION.RANDOM &&
    resolvedTemplates.length > 0
  ) {
    return {
      ok: true,
      selectedTemplates: [resolvedTemplates[Math.floor(Math.random() * resolvedTemplates.length)]],
    };
  }

  return { ok: true, selectedTemplates: resolvedTemplates };
}
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/domain/template-resolver.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 3: Stage**

```bash
git add src/domain/template-resolver.ts tests/domain/template-resolver.test.ts
```

Suggested commit: `feat: add resolveTemplates helper with tests`

---

## Task 12: Wire EventDetector and Scheduler to use `resolveTemplates` (Pass 2, Finding #8 — refactor)

**Files:**

- Modify: `src/worker/event-detector.ts:77-83, 134-171`
- Modify: `src/worker/scheduler.ts:190-247`

- [ ] **Step 1: Refactor EventDetector**

In `src/worker/event-detector.ts`:

Add import: `import { resolveTemplates } from '../domain/template-resolver.js';`

Replace lines 77-83 (contentConfig validation) and 134-171 (template resolution) with:

```ts
// Replace the inline validation + template resolution with:
const allTemplates = await this.deps.db
  .select()
  .from(contentTemplates)
  .where(and(eq(contentTemplates.verticalId, verticalId), eq(contentTemplates.enabled, true)));

const resolution = resolveTemplates(contentConfig, allTemplates);

if (!resolution.ok) {
  this.deps.logger.error(
    {
      rule: rule.name,
      reason: resolution.reason,
      ...(resolution.reason === 'missing-templates'
        ? { missingNames: resolution.missingNames }
        : {}),
    },
    resolution.reason === 'invalid-content-config'
      ? 'Misconfigured content_config — skipping rule'
      : 'Some configured template names not found or disabled — skipping without consuming cooldown',
  );
  continue;
}

let selectedTemplates = resolution.selectedTemplates;
```

Remove the now-unused inline `resolvedTemplates`, `resolvedNames`, `missingNames`, and RANDOM selection block. In `event-detector.ts`, remove only `validateContentConfig` from the multi-import (keep `DefaultTriggerEvaluator`, `matchesEvent`, `evaluatePredicates`, etc.). In `scheduler.ts`, delete the entire standalone `import { validateContentConfig } from '../domain/trigger-evaluator.js';` line.

- [ ] **Step 2: Refactor Scheduler**

In `src/worker/scheduler.ts` `claimAndFireScheduledRule` method:

Add import: `import { resolveTemplates } from '../domain/template-resolver.js';`

Replace lines 190-199 (validation) and lines 211-247 (template resolution). Keep the cooldown check at lines 201-209 intact between the two replaced sections. The replacement code:

```ts
const contentConfig = rule.content_config;

const templates = await tx
  .select()
  .from(contentTemplates)
  .where(
    and(eq(contentTemplates.verticalId, rule.vertical_id), eq(contentTemplates.enabled, true)),
  );

const resolution = resolveTemplates(contentConfig, templates);

if (!resolution.ok) {
  this.deps.logger.error(
    {
      rule: rule.name,
      reason: resolution.reason,
      ...(resolution.reason === 'missing-templates'
        ? { missingNames: resolution.missingNames }
        : {}),
    },
    resolution.reason === 'invalid-content-config'
      ? 'Misconfigured content_config — skipping'
      : 'Some configured template names not found or disabled — skipping',
  );
  await this.advanceScheduleInTx(tx, rule.id, rule.schedule);
  fired = true;
  return;
}

templateNamesList = resolution.selectedTemplates.map(t => t.name);
selectionMode = contentConfig.templateSelection;
```

Keep cooldown check and schedule advancement logic in the caller.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Run template resolver tests**

Run: `npx vitest run tests/domain/template-resolver.test.ts`
Expected: All PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Stage**

```bash
git add src/worker/event-detector.ts src/worker/scheduler.ts
```

Suggested commit: `refactor: wire EventDetector and Scheduler to shared resolveTemplates helper`

---

## Task 13: Pass 2 verification checkpoint

- [ ] **Step 1: Full build**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Verify strategy tests still green**

Run: `npx vitest run tests/plugins/posting-strategies/`
Expected: All PASS

- [ ] **Step 4: Verify template resolver tests green**

Run: `npx vitest run tests/domain/template-resolver.test.ts`
Expected: All PASS

---

**Pass 3 execution order:** Follow the spec's recommended order: Task 15 (#12) → Task 16 (#9) → Task 17 (#10) → Task 14 (#11). Start with the self-contained SQLWrapper typing (Task 15), then dashboard DTOs (Task 16), then JSONB parsers (Task 17), then LoggerLike (Task 14) last since it touches worker files also modified in Task 17.

## Task 14: Add `LoggerLike` type to `src/shared/logger.ts` (Pass 3, Finding #11)

**Files:**

- Modify: `src/shared/logger.ts`
- Modify: 7 worker files (listed below)

- [ ] **Step 1: Add the type export to `src/shared/logger.ts`**

Add at the end of the file:

```ts
export type LoggerLike = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
};
```

- [ ] **Step 2: Replace inline logger types in all 7 worker dep interfaces**

Update each file to import and use `LoggerLike`:

1. `src/worker/job-reaper.ts:7` — replace `{ info: (...args: any[]) => void }` with `LoggerLike`
2. `src/worker/handlers/generate-content.ts:21` — replace `{ info: ...; error: ... }` with `LoggerLike`
3. `src/worker/handlers/generate-visual.ts:13` — replace `{ info: ...; error: ... }` with `LoggerLike`
4. `src/worker/handlers/post-to-platform.ts:24-28` — replace `{ info: ...; warn: ...; error: ... }` with `LoggerLike`
5. `src/worker/metrics-poller.ts:19-24` — replace `{ info: ...; warn: ...; error: ...; debug: ... }` with `LoggerLike`
6. `src/worker/event-detector.ts:29-33` — replace `{ info: ...; warn: ...; error: ... }` with `LoggerLike`
7. `src/worker/scheduler.ts:27-31` — replace `{ info: ...; warn: ...; error: ... }` with `LoggerLike`

Each file needs: `import type { LoggerLike } from '../shared/logger.js';` (or `../../shared/logger.js` for handlers)

**Note:** `LoggerLike` requires `warn` but 3 files (`job-reaper.ts`, `generate-content.ts`, `generate-visual.ts`) don't currently define `warn`. This is safe — pino loggers have `warn`. But any test mocks for these deps that only provide `{ info: vi.fn(), error: vi.fn() }` must be updated to include `warn: vi.fn()` to satisfy the type.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 5: Stage**

```bash
git add src/shared/logger.ts src/worker/job-reaper.ts src/worker/handlers/generate-content.ts src/worker/handlers/generate-visual.ts src/worker/handlers/post-to-platform.ts src/worker/metrics-poller.ts src/worker/event-detector.ts src/worker/scheduler.ts
```

Suggested commit: `refactor: add LoggerLike type, replace 7 inline logger shapes`

---

## Task 15: Type query-builder `any` in web routes (Pass 3, Finding #12)

**Files:**

- Modify: `src/web/api/posts.ts`
- Modify: `src/web/api/content-items.ts`

- [ ] **Step 1: Read both route files to understand the current `any` patterns**

Read `src/web/api/posts.ts` and `src/web/api/content-items.ts` fully.

- [ ] **Step 2: Replace `conditions: any[]` with `SQLWrapper[]`**

In both files, add import: `import type { SQLWrapper } from 'drizzle-orm';`

Change `const conditions: any[] = []` to `const conditions: SQLWrapper[] = []`.

- [ ] **Step 3: Remove `query.where(...) as any` casts**

Build the complete where clause first with `and(...conditions)`, then apply in a single `.where()` call instead of reassigning `query`. Guard for empty conditions: `if (conditions.length > 0) query = query.where(and(...conditions));` — `and()` with an empty spread returns `undefined`.

- [ ] **Step 4: Type the summary result**

In `posts.ts`, define a small interface for the summary row:

```ts
interface PostsSummaryRow {
  total_posts: number;
  total_views: number;
  total_likes: number;
  total_shares: number;
  total_comments: number;
}
```

Replace `(summaryResult as any)[0]` with `(summaryResult as PostsSummaryRow[])[0]`.

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Run tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 7: Stage**

```bash
git add src/web/api/posts.ts src/web/api/content-items.ts
```

Suggested commit: `refactor: replace query-builder any casts with SQLWrapper and typed row shapes`

---

## Task 16: Define dashboard DTO types (Pass 3, Finding #9)

**Files:**

- Create: `src/web/dashboard/src/api-types.ts`
- Modify: `src/web/dashboard/src/api.ts`
- Modify: 5 dashboard component files

- [ ] **Step 1: Read server route files to derive response shapes**

Read `src/web/api/posts.ts`, `src/web/api/content-items.ts`, `src/web/api/verticals.ts`, and `src/web/api/metrics.ts`. Note the Drizzle select shapes and join columns.

- [ ] **Step 2: Create `src/web/dashboard/src/api-types.ts`**

Define DTOs matching the actual server response shapes. Model the polymorphic `/api/posts` response (bare array vs `{ items, summary }`).

- [ ] **Step 3: Type the API functions in `api.ts`**

Add return type annotations to `fetchPendingContent`, `fetchPostsWithFilters`, `fetchVerticals`, `fetchMetricsHistory` using the new DTOs.

- [ ] **Step 4: Update page state types**

Replace `useState<any[]>([])` and `useState<any>(null)` in `ReviewQueue.tsx`, `PostMonitor.tsx`, and `VerticalManagement.tsx` with the typed DTOs. These are the three pages with explicit `any` state.

- [ ] **Step 5: Update component-level `any` usage**

In `MetricsChart.tsx`: replace the `(s: any)` map callback with the typed snapshot DTO (the component already uses typed `useState<ChartPoint[]>` — only the response-driven callback is untyped).

In `ContentCard.tsx`: replace `(item.aiConfig as any)` and `(item.cost as any)` casts with typed fields from the content item DTO.

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Verify `any` count decreased**

First, record baseline before starting this task: `rg -c ': any\b|as any\b' src/web/dashboard/src/ -g '*.ts' -g '*.tsx'`

After completing all steps, run the same command again.
Expected: Net decrease of at least 5 typed `any` occurrences compared to baseline.

- [ ] **Step 8: Stage**

```bash
git add src/web/dashboard/src/api-types.ts src/web/dashboard/src/api.ts src/web/dashboard/src/pages/ src/web/dashboard/src/components/
```

Suggested commit: `refactor: add dashboard DTO types, replace any in 5 components`

---

## Task 17: Add JSONB typed parsers (Pass 3, Finding #10)

**Files:**

- Create: `src/domain/config-parsers.ts`
- Create: `src/plugins/visual-generators/config-parser.ts`
- Create: `src/plugins/posting-strategies/account-config.ts`
- Modify: 7 consumer files

This task has three sub-slices. Implement each and verify before continuing.

**Parsing strategy:** Use type assertions (`as VerticalConfig`) for now, following the existing `validateContentConfig()` type-guard pattern in `src/domain/trigger-evaluator.ts`. Do NOT introduce Zod or runtime validation — keep it simple.

**Note:** `ContentConfig` already exists in `src/domain/trigger-evaluator.ts:10-13` (with `templateNames` and `templateSelection`). Import it from there rather than re-declaring. It is also imported by `src/domain/template-resolver.ts` (Task 11).

- [ ] **Step 1 (10a): Create trigger/content config parsers in `src/domain/config-parsers.ts`**

Define `VerticalConfig` based on actual access patterns:

```ts
export interface VerticalConfig {
  defaults?: {
    triggerEvaluator?: string;
    contentGenerator?: { provider?: string; model?: string };
    tagVocabulary?: string[];
  };
}

export function asVerticalConfig(raw: unknown): VerticalConfig {
  return (raw ?? {}) as VerticalConfig;
}
```

Import `ContentConfig` from `trigger-evaluator.ts` and re-export if needed. Do NOT re-declare it.

- [ ] **Step 2 (10a): Replace `as any` casts in event-detector.ts and scheduler.ts**

In `event-detector.ts`: replace `(vertical?.config as any)?.defaults` with the typed `VerticalConfig` parser. Replace `rule.contentConfig as any` with the typed ContentConfig.

In `scheduler.ts`: note that the claimed raw SQL row uses snake_case: `rule.content_config` (not `rule.contentConfig`). The `const rule = claimedRows[0] as any` on line 185 gives an untyped row — either type the raw row shape or use the `VerticalConfig`/`ContentConfig` parsers on the individual fields accessed from `rule`.

- [ ] **Step 3 (10a): Verify build and tests**

Run: `npx tsc --noEmit && npx vitest run`

- [ ] **Step 4 (10b): Create visual template config parser in `src/plugins/visual-generators/config-parser.ts`**

Define `VisualTemplateConfig { template?: string; skipVisual?: boolean; config?: { width?: number; height?: number } }`.

- [ ] **Step 5 (10b): Replace `as any` casts in generate-visual.ts and puppeteer-html.ts**

- [ ] **Step 6 (10b): Verify build and tests**

Run: `npx tsc --noEmit && npx vitest run`

- [ ] **Step 7 (10c): Add account/platform config parser near posting code**

Create a small typed accessor for account config JSONB fields accessed in `src/worker/handlers/post-to-platform.ts` (e.g., `accountConfig.dryRun`, `accountConfig.postingStrategy`). Also type the `generate-content.ts` vertical config access (`(vertical?.config as any)?.defaults`).

Place the account config parser near posting code (e.g., in `src/plugins/posting-strategies/account-config.ts` or inline in the handler if the shape is small).

- [ ] **Step 8 (10c): Verify build and tests**

Run: `npx tsc --noEmit && npx vitest run`

- [ ] **Step 9: Stage all**

```bash
git add src/domain/config-parsers.ts src/plugins/visual-generators/config-parser.ts src/plugins/posting-strategies/account-config.ts src/worker/ src/plugins/visual-generators/puppeteer-html.ts
```

Suggested commit: `refactor: add JSONB typed parsers, replace as-any casts in 7 files`

---

## Task 18: Pass 3 verification checkpoint

- [ ] **Step 1: Full build**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 3: Verify `any` reduction**

Run: `rg -c 'as any' src/ -g '*.ts' | sort -t: -k2 -rn | head -10`
Compare against pre-refactor count. Expect significant reduction in listed files.

---

## Tasks 19-21: Pass 4 (Optional — skip if low ROI)

### Task 19: Temperature default helper (Finding #13)

Only if a third content generator is being added. Otherwise skip.

**Files:**

- Create: `src/plugins/content-generators/llm-helpers.ts` (if needed)

- [ ] **Step 1: Assess ROI** — the only duplicated code is `(input.generationConfig?.temperature as number) ?? 0.7`. If this is one line in two files, skip.

### Task 20: `computeChangePct` utility (Finding #14)

Only if both providers share identical zero/null guard semantics.

- [ ] **Step 1: Compare guard logic** — if CoinGecko checks `previousPrice !== 0` and ExchangeRate checks `previousRate != null && previousRate !== 0`, the guards differ. Skip unless unifiable without extra conditionals.

### Task 21: `assertOk` HTTP helper (Finding #15)

- [ ] **Step 1: If proceeding, create `src/shared/http.ts`**

```ts
export async function assertOk(res: Response, errorPrefix: string): Promise<void> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${errorPrefix}: ${body}`);
  }
}
```

- [ ] **Step 2: Replace 8+ call sites in posting strategies and Twitter metrics collector**

Only touch files listed in the spec. Do NOT touch `instagram.ts` (metrics) or data source providers.

- [ ] **Step 3: Verify build and tests**

Run: `npx tsc --noEmit && npx vitest run`
