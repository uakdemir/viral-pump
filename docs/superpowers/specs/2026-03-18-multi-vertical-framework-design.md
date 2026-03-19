# ViralEngine — Sub-project #3: Multi-Vertical Framework

**Date:** 2026-03-18
**Status:** Draft
**Scope:** Make the system configurable for multiple verticals (Gold/Forex, Fitness, Dating) through config + prompts + HTML templates, with minimal code changes per new vertical.

---

## 1. Overview

Refactor the Core Pipeline MVP to support multiple verticals with minimal code changes. Adding a new **schedule-driven vertical** (like Fitness or Dating), or a vertical that uses **existing data source providers** and the `DefaultTriggerEvaluator`, requires only SQL inserts + an optional HTML template file. Verticals that need a new data source API or custom trigger evaluation logic require a small code plugin addition.

This sub-project generalizes the four hardcoded spots identified in Sub-project #1: the `DetectedEvent` schema, the trigger evaluator, the visual generator, and the template filler. It also adds scheduled (cron-based) trigger support for content-first verticals that don't rely on real-time API events.

### What this sub-project delivers

- Generic `DetectedEvent` (no financial-specific fields)
- Compound trigger predicates (AND/OR logic on multiple fields)
- `TriggerEvaluator` interface with vertical-specific override capability via factory/registry
- Cron-based scheduled triggers for content-first verticals (Fitness, Dating)
- Pluggable HTML visual templates loaded from filesystem by name
- Shared template filler with dot-path support and context assembly
- AI-assigned tags on generated content items (for future learning engine analysis)
- Seed data for three verticals: Gold/Forex, Fitness, Dating

### What this sub-project does NOT deliver

- New data source provider plugins (Fitness/Dating are schedule-driven)
- Vertical-specific `TriggerEvaluator` implementations (only `DefaultTriggerEvaluator`)
- Calendar-aware scheduling (Valentine's Day, Ramadan, etc.) — noted for future
- Cross-vertical content sharing — templates stay vertical-specific
- Dashboard changes (already filters by vertical)
- New posting strategy plugins (Instagram, TikTok — Sub-project #4)

---

## 2. Dependencies

- **Requires:** Sub-project #1 (Core Pipeline MVP) — complete and tested
- **No new infrastructure:** No new databases, services, or external dependencies

---

## 3. Generic DetectedEvent

### Current (financial-specific)

```typescript
interface DetectedEvent {
  source: string;
  instrument: string;       // financial
  baseCurrency: string;     // financial
  quoteCurrency: string;    // financial
  price: number;            // financial
  previousPrice: number;    // financial
  changePct: number;        // financial
  observedAt: Date;
  rawPayload: Record<string, unknown>;
}
```

### New (generic)

```typescript
interface DetectedEvent {
  source: string;                        // provider name: "coingecko", "nutritionix"
  type: string;                          // event category: "price-update", "food-lookup"
  verticalId: string;                    // which vertical this event belongs to
  observedAt: Date;
  data: Record<string, unknown>;         // all vertical-specific fields
  rawPayload: Record<string, unknown>;   // original API response
}
```

### Migration

Financial fields move into `data`. CoinGecko provider produces (using BTC as a price-movement proxy since the free tier doesn't support XAU):

```typescript
{
  source: 'coingecko',
  type: 'price-update',
  verticalId: '00000000-...-000001',
  observedAt: now,
  data: {
    instrument: 'BTC/USD',
    baseCurrency: 'BTC',
    quoteCurrency: 'USD',
    price: 74141,
    previousPrice: 74100,
    changePct: 0.055,
  },
  rawPayload: { ... }
}
```

A Fitness scheduled trigger produces:

```typescript
{
  source: 'scheduler',
  type: 'scheduled',
  verticalId: '00000000-...-000010',
  observedAt: now,
  data: {
    triggerType: 'scheduled',
    scheduledAt: '2026-03-18T14:00:00Z',
    ruleName: 'Daily workout tip at 8AM',
  },
  rawPayload: {}
}
```

### Consumer updates

All consumers that previously read `event.price`, `event.changePct`, etc. now read `event.data.price`, `event.data.changePct`. Specifically:

- Trigger evaluator: evaluates against `event.data[field]`
- Template filler: fills `{{price}}` from `event.data.price`
- Visual templates: render from `event.data`

---

## 4. Compound Trigger Predicates

### Condition schema

```json
{
  "match": { "source": "coingecko", "instrument": "BTC/USD" },
  "predicates": [
    { "field": "price", "operator": "gt", "value": 70000 },
    { "field": "changePct", "operator": "gt", "value": 1.0 }
  ],
  "logic": "AND"
}
```

- `match` — filters which `DetectedEvent`s this rule applies to. **Resolution:** `source`, `type`, and `verticalId` are matched against top-level `DetectedEvent` fields. All other match keys (e.g., `instrument`) are matched against `event.data`. All fields optional; omitted = match any.
- `predicates` — array of conditions. Each has `field` (key in `event.data`), `operator` (`gt`, `gte`, `lt`, `lte`, `eq`), `value` (number).
- `logic` — `"AND"` (default, all predicates must pass) or `"OR"` (any predicate must pass).

### For scheduled triggers

Scheduled triggers don't evaluate predicates — they fire based on cron schedule. The `predicates` array can be empty:

```json
{
  "match": {},
  "predicates": [],
  "logic": "AND"
}
```

---

## 5. TriggerEvaluator Interface

### Interface

```typescript
interface RuleInput {
  condition: {
    match: Record<string, string>;
    predicates: Array<{ field: string; operator: string; value: number }>;
    logic: 'AND' | 'OR';
  };
  fireMode: 'threshold_cross' | 'stateful_true' | 'every_poll' | 'scheduled';
  cooldownMs: number;
  lastFiredAt: Date | null;
  contentConfig: {
    templateSelection: 'named' | 'random';
    templateNames: string[];
  };
}

interface TriggerEvaluator {
  evaluate(rule: RuleInput, event: DetectedEvent): boolean;
}
```

### Resolution

```
1. Read vertical config → config.defaults.triggerEvaluator
2. If set (e.g., "finance"), resolve from registry → FinanceTriggerEvaluator
3. If not set, use DefaultTriggerEvaluator (fallback)
```

### DefaultTriggerEvaluator

The only implementation for Sub-project #3. Handles:

1. `matchesEvent()` — check `condition.match` fields: `source`/`type`/`verticalId` against top-level event fields, all others against `event.data`
2. Evaluate all `predicates` against `event.data[field]` using specified operator
3. Combine results with `logic` (AND/OR)
4. Check cooldown expiry (`lastFiredAt` + `cooldownMs`)

### Future vertical-specific evaluators

Not built now, but the interface supports them. A `FinanceTriggerEvaluator` could add "price crossed round number" or "RSI divergence" detection. A `FitnessTriggerEvaluator` could add "streak detection" or "goal milestone" logic. These would extend or wrap the default evaluator and be registered in the factory/registry.

---

## 6. Scheduled Triggers (Cron-based)

### Schema change

Add to `trigger_rules`:
- `schedule` (TEXT, nullable) — cron expression (e.g., `"0 8 * * *"` = every day at 8AM UTC)

### fire_mode values

| fire_mode | Behavior |
|---|---|
| `threshold_cross` | Fires when predicate transitions from false to true (existing) |
| `stateful_true` | Fires every poll while predicate is true (existing) |
| `every_poll` | Fires on every poll regardless of predicate (existing) |
| `scheduled` | Fires based on cron schedule, ignores predicates and data source events |

### Schema additions for scheduled triggers

Add to `trigger_rules`:
- `next_scheduled_at` (TIMESTAMPTZ, nullable) — the next computed firing time, persisted for durability

On worker startup and after each firing, `next_scheduled_at` is computed from the cron expression using `cron-parser` and stored. This survives worker restarts.

### How scheduled triggers work

1. The **scheduler** (worker process) runs a cron check loop every 60 seconds alongside data source polling
2. The loop processes **all due rules per cycle** (not just one). For each due rule:
3. **Steps 3-7 execute in a single database transaction:**
4. Queries: `SELECT ... FROM trigger_rules WHERE fire_mode = 'scheduled' AND enabled = true AND next_scheduled_at <= now() FOR UPDATE SKIP LOCKED LIMIT 1`
5. The `FOR UPDATE SKIP LOCKED` prevents multiple workers from claiming the same scheduled firing
6. Computes the next firing time from the cron expression, updates `next_scheduled_at` and `last_fired_at`
7. Inserts `generate-content` job(s) into `job_queue` for templates specified in `content_config` (see Section 6a), with `(trigger_rule_id, scheduled_at)` as unique identity in payload to prevent duplicate enqueues
8. **Transaction commits** — if any step fails, nothing is persisted (rule not advanced, job not created)
9. After commit: logs the firing with rule name, vertical, and template count
10. **Loop continues** to claim the next due rule until no more are available

---

## 6a. Trigger Rule → Template Selection (`content_config`)

**Applies to ALL trigger rules** (event-driven and scheduled alike).

Every trigger rule **must** specify which content templates to activate when it fires. There is no fallback to "all templates" — this prevents accidental content generation from misconfigured rules.

**`content_config` schema:**

```json
{
  "templateSelection": "named",
  "templateNames": ["fitness-workout-tip", "fitness-myth-bust"]
}
```

Or for rules that should randomly pick one template per firing:

```json
{
  "templateSelection": "random",
  "templateNames": ["dating-red-flag", "dating-green-flag"]
}
```

**`templateSelection` values:**

| Value | Behavior |
|---|---|
| `"named"` | Activate ALL templates listed in `templateNames`. One content item per template. |
| `"random"` | Randomly pick ONE template from `templateNames` per firing. |

**Validation at rule evaluation time** (in the event detector / scheduler, before firing):
- `content_config.templateSelection` must be `"named"` or `"random"`
- `content_config.templateNames` must be a non-empty array
- All referenced template names must resolve to existing, enabled templates in `content_templates` for the same vertical

**No default behavior.** If `content_config` is empty, invalid, or references non-existent templates, the trigger rule is treated as misconfigured — logged as error, skipped. No content is generated. This validation runs at evaluation time (not at SQL insert time) since rules are managed via direct SQL in MVP.

**Note:** This `content_config` contract applies to ALL fire modes (including `threshold_cross`, `every_poll`, etc.), not just scheduled triggers. Every trigger rule must explicitly specify its templates.

### Restart behavior

On worker startup, the scheduler scans all `fire_mode = 'scheduled'` rules and recomputes `next_scheduled_at` for any rules where it is NULL or in the past. **Missed firings are skipped, not caught up** — if the worker was down during a scheduled time, that firing is lost. This prevents a burst of backdated content after a restart.

### Content generation for scheduled triggers

The `generate-content` handler works the same way — it fills the prompt template with the context object. For scheduled triggers, `event.data` contains minimal info (trigger name, scheduled time). The LLM generates original content purely from the prompt template without event-specific data.

Example prompt template for Fitness:

```
You are a fitness content creator for social media. Write a tweet (max 270 chars) with a practical workout tip.

Requirements:
- Focus on one specific, actionable exercise or technique
- Include a brief explanation of why it works
- Tone: encouraging, knowledgeable, no bro-science
- Do NOT use hashtags or emojis

Also return 2-5 tags from this list that describe your content:
motivation, discipline, data-driven, educational, beginner, advanced, nutrition, workout, recovery, mindset
```

No `{{placeholders}}` needed — the LLM generates freely from the prompt.

---

## 7. Pluggable Visual Templates

### Structure

```
templates/
  visuals/
    price-card.html          ← financial verticals (Gold/Forex)
    tip-card.html            ← advice content (Fitness tips, Dating tips)
    stat-card.html           ← data comparisons (calories, dating stats)
    quote-card.html          ← text-heavy content (myths, facts, red flags)
```

### How it works

1. `content_templates.visualTemplate` JSONB specifies the template name:
   ```json
   { "template": "price-card", "config": { "width": 1200, "height": 628 } }
   ```

2. `PuppeteerHtmlVisualGenerator` reads `templates/visuals/<name>.html`

3. HTML template uses `{{field}}` placeholders — injected from a context object containing `event.data` fields + `generatedText` + computed helpers

4. Puppeteer renders to PNG as before

### Template format

Each HTML file is a self-contained page with embedded CSS. Placeholders use `{{field}}` syntax (same as prompt templates).

**Example `price-card.html`** (extracted from current hardcoded method):

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  /* price card styles */
</style></head>
<body>
  <div class="instrument">{{instrument}}</div>
  <div class="price-row">
    <span class="price">${{price}}</span>
    <span class="change {{directionClass}}">{{directionArrow}} {{changePctAbs}}%</span>
  </div>
  <div class="text">{{generatedText}}</div>
  <div class="footer">{{date}}</div>
</body>
</html>
```

**Example `tip-card.html`** (for Fitness/Dating):

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  /* tip card styles - dark background, large text */
</style></head>
<body>
  <div class="category">{{category}}</div>
  <div class="text">{{generatedText}}</div>
  <div class="footer">{{date}}</div>
</body>
</html>
```

### Adding a new visual design

Drop an HTML file in `templates/visuals/`, reference it by name in the content template's `visualTemplate.template` field. No code change.

### Text-only content (no visual)

Some content templates may not need a visual (e.g., text-only tweets). To support this:

```json
{
  "visualTemplate": { "template": null, "skipVisual": true }
}
```

When `skipVisual: true`:
- The `generate-visual` job is **not enqueued**
- `content_items.visual_url` stays NULL
- `generation_status` transitions directly from `generating` to `ready` after text generation
- The content is reviewable and postable without an image

**Validation:** If `skipVisual` is false or absent, `template` must be a non-empty string referencing an existing HTML file. If the template file is not found at runtime, the content item is marked `generation_status = 'failed'` with a descriptive error — this is a configuration mistake, not a transient failure, so retrying will not help.

### Removing hardcoded renderPriceCard()

The existing `PuppeteerHtmlVisualGenerator.renderPriceCard()` method is deleted. Its HTML is extracted to `templates/visuals/price-card.html`. The generator becomes a generic "load template, fill placeholders, screenshot" engine.

---

## 8. Shared Template Filler

### Functions

Two modes — **prompt filling** (plain text, no escaping) and **HTML filling** (escapes `<`, `>`, `&`, `"` to prevent broken rendering when LLM output is injected):

```typescript
function fillPromptTemplate(template: string, context: Record<string, unknown>): string {
  return fill(template, context, false);
}

function fillHtmlTemplate(template: string, context: Record<string, unknown>): string {
  return fill(template, context, true);
}

function fill(template: string, context: Record<string, unknown>, escapeHtml: boolean): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
    const value = resolvePath(context, path);
    if (value == null) return '';
    const str = String(value);
    return escapeHtml ? htmlEscape(str) : str;
  });
}
```

Supports dot paths (`{{data.price}}`). Content generators use `fillPromptTemplate()`. Visual generators use `fillHtmlTemplate()`. HTML escaping prevents broken cards when LLM output contains `<`, `>`, or `&`.

### Context assembly

For each content generation job, a context object is assembled:

```typescript
const context = {
  // Event data fields (spread at top level for easy access)
  ...event.data,
  // Event metadata
  source: event.source,
  type: event.type,
  // Trigger rule metadata
  lookbackMinutes: rule.lookbackWindowMs / 60000,
  ruleName: rule.name,
  // Generated content (for visual templates)
  generatedText: generatedText,
  // Computed helpers
  date: new Date().toLocaleDateString(),
  direction: (event.data.changePct as number) >= 0 ? 'up' : 'down',
  directionArrow: (event.data.changePct as number) >= 0 ? '\u25B2' : '\u25BC',
  directionClass: (event.data.changePct as number) >= 0 ? 'up' : 'down',
  changePctAbs: Math.abs(event.data.changePct as number ?? 0).toFixed(2),
};
```

**Context assembly branches on trigger type.** For event-driven triggers, the full context is assembled including computed helpers (direction, changePctAbs, etc.). For scheduled triggers (no event data), the context contains only trigger metadata (`ruleName`, `scheduledAt`), `date`, and `generatedText` — computed financial helpers are omitted entirely, not computed with missing values.

---

## 9. AI-Assigned Content Tags

### Schema change

Add to `content_items`:
- `tags` (JSONB, default `[]`) — AI-assigned tags per generated content item

### How it works

1. The prompt template includes a tagging instruction at the end:
   ```
   Also return 2-5 tags from this list that describe your content:
   motivation, discipline, data-driven, educational, beginner, advanced, ...
   ```

2. The content generator parses the LLM response to extract:
   - The tweet text (main content)
   - The tags (list of strings)

3. Both are stored on the `content_items` row: `generated_text` and `tags`

### LLM response format

The prompt instructs the LLM to return a structured response:

```
Tweet: <the tweet text>
Tags: motivation, educational, beginner
```

**Parsing contract:**

1. Split response on `Tags:` (case-insensitive). If found: everything before is tweet text, everything after is comma-separated tags.
2. Strip the `Tweet:` prefix from the text portion (case-insensitive) if present.
3. Trim whitespace from text and each tag.
4. Validate tags against the vertical's `tagVocabulary` — discard any tag not in the vocabulary.
5. **Graceful degradation:** If the response doesn't contain `Tags:` at all, the full response becomes `generated_text` and `tags` stays empty. Content is still usable — just untagged.

### Predefined tag vocabulary

The tag list is stored in `verticals.config.defaults.tagVocabulary` so each vertical can define its own relevant tags:

- **Gold/Forex:** `["urgent", "data-driven", "historical", "prediction", "educational"]`
- **Fitness:** `["motivation", "discipline", "nutrition", "workout", "recovery", "mindset", "beginner", "advanced"]`
- **Dating:** `["safety", "self-worth", "humor", "red-flag", "green-flag", "conversation", "psychology"]`

### Future use (Sub-project #5 — Learning Engine)

```sql
SELECT tag, AVG((metrics->>'views')::int) as avg_views
FROM content_items
CROSS JOIN jsonb_array_elements_text(tags) AS tag
JOIN posts ON posts.content_id = content_items.id
GROUP BY tag
ORDER BY avg_views DESC;
```

---

## 10. Schema Changes Summary

### Modified tables

**trigger_rules:**
- `condition` JSONB — format changes from `{ match, predicate }` to `{ match, predicates, logic }`
- Add `schedule` TEXT (nullable) — cron expression for `fire_mode = 'scheduled'`
- Add `next_scheduled_at` TIMESTAMPTZ (nullable) — next computed firing time, persisted for durability and concurrency safety

**content_items:**
- Add `tags` JSONB (default `[]`) — AI-assigned tags

**content_templates:**
- Add UNIQUE constraint on `(vertical_id, name)` — ensures `content_config.templateNames` references are unambiguous within a vertical

### No new tables

All changes are column additions, constraint additions, or JSONB format changes on existing tables.

---

## 11. File Changes

### Modified files

| File | Change |
|---|---|
| `src/domain/detected-event.ts` | Generic schema: `source`, `type`, `verticalId`, `observedAt`, `data`, `rawPayload` |
| `src/domain/trigger-evaluator.ts` | `TriggerEvaluator` interface + `DefaultTriggerEvaluator` with compound predicates (AND/OR), match against `event.data` |
| `src/plugins/data-sources/coingecko.ts` | Produce generic `DetectedEvent` with fields in `data`, include `verticalId` |
| `src/plugins/data-sources/exchangerate.ts` | Same |
| `src/plugins/data-sources/types.ts` | `DataSourceProvider.poll()` receives `verticalId` parameter |
| `src/plugins/visual-generators/puppeteer-html.ts` | Load HTML templates from `templates/visuals/` by name, fill with context, screenshot. Delete `renderPriceCard()`. |
| `src/plugins/content-generators/claude.ts` | Use shared `fillPromptTemplate()`. Parse LLM response for text + tags. |
| `src/plugins/content-generators/openai.ts` | Same |
| `src/plugins/content-generators/types.ts` | `ContentGeneratorOutput` adds `tags: string[]` |
| `src/worker/scheduler.ts` | Add cron check loop for scheduled triggers. Pass `verticalId` to events. |
| `src/worker/event-detector.ts` | Resolve `TriggerEvaluator` from vertical config via registry. |
| `src/worker/handlers/generate-content.ts` | Assemble context object. Store AI-assigned tags. Handle scheduled triggers (no event data). Check `visualTemplate.skipVisual` — if true, skip `generate-visual` job and transition directly to `ready`. |
| `src/worker/handlers/generate-visual.ts` | Pass context to visual generator instead of raw event data. |
| `src/shared/schema/trigger-rules.ts` | Add `schedule` column |
| `src/shared/schema/content-items.ts` | Add `tags` column |
| `db/seed.sql` | Update Gold/Forex to new format, add Fitness + Dating verticals |

### New files

| File | Purpose |
|---|---|
| `src/shared/template-filler.ts` | Shared `fillPromptTemplate()` and `fillHtmlTemplate()` with dot-path support |
| `templates/visuals/price-card.html` | Extracted from hardcoded `renderPriceCard()` |
| `templates/visuals/tip-card.html` | For Fitness/Dating advice content |
| `templates/visuals/stat-card.html` | For data comparisons |
| `templates/visuals/quote-card.html` | For text-heavy content |

---

## 12. Multi-Vertical Posting Behavior

Each vertical has its own accounts. On content approval, the review workflow creates post rows for all active accounts in that vertical and enqueues `post-to-platform` jobs — same as Sub-project #1.

**Account resolution per vertical:**
- Gold/Forex → posts to `Gold Forex EN` + `Altın Döviz TR` accounts
- Fitness → posts to `Fitness Daily EN` account
- Dating → posts to `Dating Tips EN` account

**Seed accounts use `dry-run` posting strategy** (already implemented in Sub-project #1 — see `src/plugins/posting-strategies/dry-run.ts`). No Twitter API credentials needed for testing. When real credentials are configured per account, switch `postingStrategy` to `twitter-api` in `accounts.config`.

**The posting handler already resolves credentials per account** (implemented in Sub-project #1) — no changes needed to the posting path. Each vertical's accounts are independent.

---

## 13. Seed Data

### Gold/Forex (updated)

- Vertical: Gold & Forex (existing, updated config)
- Accounts: Gold Forex EN, Altın Döviz TR (existing)
- Data sources: CoinGecko (BTC as price-movement proxy — CoinGecko free tier does not support XAU), ExchangeRate API (USD/TRY, USD/EUR) — existing
- Trigger rules: updated to `predicates` array format, explicit `content_config` with `templateSelection: "named"` and `templateNames`
- Content templates: updated prompts with tag extraction instruction
- Visual template: `price-card`

### Fitness (new)

- Vertical: `fitness` (slug: `fitness`)
- Config: `{ "defaults": { "contentGenerator": { "provider": "claude", "model": "claude-haiku-4-5-20251001" }, "visualGenerator": { "provider": "puppeteer-html" }, "language": "en", "tone": "encouraging", "brandVoice": "knowledgeable, practical, no bro-science", "tagVocabulary": ["motivation", "discipline", "nutrition", "workout", "recovery", "mindset", "beginner", "advanced"] } }`
- Account: `Fitness Daily EN` (twitter, en, global, dry-run)
- Data sources: none (schedule-driven)
- Trigger rules (fire_mode: scheduled) → template mapping via `content_config`:
  - "Daily workout tip" — cron `0 8 * * *` (8AM UTC) → activates templates: `fitness-workout-tip`, `fitness-myth-bust`
  - "Nutrition fact" — cron `0 14 * * *` (2PM UTC) → activates template: `fitness-nutrition-fact`
  - "Motivation Monday" — cron `0 10 * * 1` (10AM UTC, Mondays) → activates template: `fitness-motivation`
- Content templates:
  - `fitness-workout-tip` (L1, category: tip, visual: tip-card)
  - `fitness-nutrition-fact` (L1, category: educational, visual: stat-card)
  - `fitness-motivation` (L2, category: motivation, visual: quote-card)
  - `fitness-myth-bust` (L2, category: educational, visual: tip-card)

### Dating (new)

- Vertical: `dating` (slug: `dating`)
- Config: `{ "defaults": { "contentGenerator": { "provider": "claude", "model": "claude-haiku-4-5-20251001" }, "visualGenerator": { "provider": "puppeteer-html" }, "language": "en", "tone": "witty and empowering", "brandVoice": "your brutally honest best friend, safety-conscious", "tagVocabulary": ["safety", "self-worth", "humor", "red-flag", "green-flag", "conversation", "psychology", "confidence"] } }`
- Account: `Dating Tips EN` (twitter, en, global, dry-run)
- Data sources: none (schedule-driven)
- Trigger rules (fire_mode: scheduled) → template mapping via `content_config`:
  - "Daily dating tip" — cron `0 10 * * *` (10AM UTC) → activates template: `dating-daily-tip`
  - "Red/green flag" — cron `0 18 * * *` (6PM UTC) → activates templates: `dating-red-flag`, `dating-green-flag` (randomly picks one per firing)
  - "Weekend conversation starters" — cron `0 12 * * 5` (Noon UTC, Fridays) → activates template: `dating-conversation-starter`
- Content templates:
  - `dating-daily-tip` (L1, category: tip, visual: tip-card)
  - `dating-red-flag` (L1, category: safety, visual: quote-card)
  - `dating-green-flag` (L1, category: positive, visual: quote-card)
  - `dating-conversation-starter` (L2, category: practical, visual: tip-card)

---

## 14. Success Criteria

- [ ] `DetectedEvent` is fully generic — no financial-specific fields in the interface
- [ ] CoinGecko and ExchangeRate providers produce generic events with fields in `data`
- [ ] Trigger rules use `predicates` (array) + `logic` (AND/OR) format
- [ ] `DefaultTriggerEvaluator` evaluates compound predicates against `event.data`
- [ ] `TriggerEvaluator` interface exists with registry resolution from vertical config
- [ ] Scheduled triggers fire on cron schedule (Fitness/Dating seed rules)
- [ ] Scheduled triggers respect cooldown
- [ ] Content generation works for both event-driven (Gold/Forex) and scheduled (Fitness/Dating) triggers
- [ ] LLM generates text + tags; tags stored on `content_items.tags`
- [ ] Visual templates loaded from `templates/visuals/` by name
- [ ] `price-card.html` extracted from hardcoded method, renders correctly
- [ ] `tip-card.html`, `stat-card.html`, `quote-card.html` render for Fitness/Dating content
- [ ] Shared `fillPromptTemplate()` (content generators) and `fillHtmlTemplate()` (visual generators) handle dot paths with HTML escaping in HTML mode
- [ ] Content templates with `skipVisual: true` skip visual generation and transition directly to ready
- [ ] Content templates with missing visual template file are marked `generation_status = 'failed'`
- [ ] Misconfigured trigger rules (empty/invalid `content_config`) are logged as error and skipped
- [ ] All existing SP#1 unit tests updated for new DetectedEvent shape and predicates format — all passing
- [ ] Gold/Forex pipeline still works end-to-end (no regression)
- [ ] Fitness scheduled content generates and appears in review queue
- [ ] Dating scheduled content generates and appears in review queue
- [ ] Approved Gold/Forex content posts to both Gold Forex EN + Altın Döviz TR accounts (dry-run)
- [ ] Approved Fitness content posts to Fitness Daily EN account (dry-run)
- [ ] Approved Dating content posts to Dating Tips EN account (dry-run)
- [ ] Each vertical's posts resolve to the correct accounts independently
- [ ] Adding a new schedule-driven vertical, or one using existing data source providers and the `DefaultTriggerEvaluator`, requires only SQL inserts + optional HTML template — zero code changes
