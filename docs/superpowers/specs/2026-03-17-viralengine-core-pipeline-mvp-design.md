O yes# ViralEngine — Sub-project #1: Core Pipeline MVP

**Date:** 2026-03-17
**Status:** Draft
**Scope:** Single vertical (Gold/Forex), single platform (Twitter/X), end-to-end content pipeline

---

## 1. Overview

Build an end-to-end content pipeline that detects real-time financial events from multiple APIs, generates AI-powered text and visual content, queues it for human review in a mobile-responsive web dashboard, and automatically posts approved content to Twitter/X via API.

This is the foundational sub-project of ViralEngine. It delivers the core loop (detect → generate → review → post) while establishing the plugin architecture and generic data model that all future sub-projects build on.

### What this sub-project delivers

- Event detection from CoinGecko and exchangerate.host APIs
- AI-generated tweet text (Claude or OpenAI) from detected events
- Visual content generation (HTML/CSS → Puppeteer screenshot)
- Web dashboard for content review (approve/edit/reject) and post monitoring
- Automated posting to Twitter/X via API (pay-per-use, ~cents per post)
- Generic data model (Postgres + JSONB) designed for multi-vertical, multi-platform, multi-account expansion

### What this sub-project does NOT deliver
- Metrics collection from platforms (Sub-project #2)
- Multi-vertical support (Sub-project #3 — but the data model supports it from day one)
- Learning engine (Sub-project #5)
- Affiliate tracking (Sub-project #6)
- Telegram bot notifications (future addition to the dashboard)

---

## 2. Project Decomposition Context

ViralEngine is decomposed into independent sub-projects, each with its own spec → plan → implementation cycle:

| # | Sub-project | Delivers | Dependencies |
|---|---|---|---|
| **1** | **Core Pipeline MVP (this spec)** | End-to-end loop for one vertical + one platform | None |
| 2 | Metrics Collector | Engagement data collection and storage | #1 |
| 3 | Multi-vertical Framework | Vertical abstraction, config-driven vertical onboarding | #1 |
| 4 | Multi-platform Posting | TikTok, Instagram, Newsletter output channels | #1 or #3 |
| 5 | Learning Engine v1 | Rule-based pattern matching, optimization reports | #2 |
| 6 | Affiliate Tracking | Link shortener, UTM tracking, conversion attribution | #1 + #2 |
| 7 | Learning Engine v2 | ML-based reasoning, autonomous content decisions | #5 + months of data |

---

## 3. Tech Stack

| Concern | Choice | Rationale |
|---|---|---|
| Backend | TypeScript / Node.js | Single language front-to-back, fast prototyping, strong ecosystem for APIs/scraping/Puppeteer |
| Frontend | React / TypeScript | Web dashboard for content review, mobile-responsive |
| Database | PostgreSQL + JSONB | Generic schema, flexible payloads for vertical/platform-specific data |
| Visual generation (day 1) | HTML/CSS → Puppeteer screenshot (static PNG) | Zero cost, deterministic, proven pattern. GIF animation deferred to future. |
| Visual generation (future) | Gemini / Imagen 3 | Pluggable via DI, configured per vertical |
| LLM (day 1) | Claude or OpenAI | Pluggable per task type and model level |
| Hosting (day 1) | Docker Compose for app only (web + worker) | Postgres is external — user provides connection config via env vars |
| Database migrations | Drizzle Kit | Schema-as-TypeScript, auto-generates SQL migrations, excellent JSONB support, lightweight |
| Job queue (day 1) | Postgres-backed table | Zero extra infra, pluggable interface for future BullMQ/Redis swap |

---

## 4. Architecture

### 4.1 Approach: Monolith with Worker Separation

A shared codebase with two process entry points: a **web process** (dashboard + API) and a **worker process** (background jobs: event detection, content generation, visual generation, scheduling).

```
┌──────────────── Shared Codebase ─────────────────┐
│                                                   │
│  ┌─────────────────────┐  ┌────────────────────┐  │
│  │    Web Process       │  │  Worker Process    │  │
│  │                      │  │                    │  │
│  │  • React Dashboard   │  │  • Event Detection │  │
│  │  • REST API          │  │  • Content Gen     │  │
│  │  • Auth              │  │  • Visual Gen      │  │
│  │  • Post Management   │  │    (Puppeteer)     │  │
│  │                      │  │  • Schedulers      │  │
│  └──────────┬───────────┘  └─────────┬──────────┘  │
│             │                        │             │
│  ┌──────────┴────────────────────────┴──────────┐  │
│  │            PostgreSQL + JSONB                 │  │
│  │       (shared DB, job queue via table)        │  │
│  └──────────────────────────────────────────────┘  │
│                                                   │
│  Plugins (DI): DataSource, LLM, Visual, Posting   │
└───────────────────────────────────────────────────┘
```

**Why this approach:**
- Puppeteer/LLM work isolated from dashboard — crash in visual gen doesn't take down the UI
- Shared codebase, shared types — no package syncing headaches
- Postgres-backed job queue — no Redis needed; the DB handles job coordination
- Two entries in Docker Compose: `web` and `worker`, same image
- Natural evolution: extract specific workers into separate services later if needed

### 4.2 Pipeline Flow

```
1. SCHEDULER (worker process)
   → Polls data sources at configured intervals
   → CoinGecko: every 60s for price data
   → exchangerate.host: every 300s for forex rates
   → Each provider adapter normalizes raw API response into DetectedEvent(s)
   → Empty/malformed API responses are logged and skipped (no job created, non-retryable)

2. EVENT DETECTION (worker process)
   → Evaluates trigger_rules against DetectedEvent(s)
   → Respects fire_mode: "threshold_cross" only fires on transition (was below, now above)
   → Respects cooldown_ms: skips if rule fired within cooldown window
   → Updates trigger_rule.last_fired_at on fire
   → Events matching no rule or no template are logged as ignored (no downstream job)
   → Creates a job: { type: "generate-content", event_data: {...} }

3. CONTENT GENERATION (worker process, picked up from job queue)
   → Creates content_item with generation_status = "generating", review_status = "draft"
   → Selects matching content_template(s) for the event
   → Sends prompt to LLM (Claude/OpenAI) with event data + template
   → Generates text content, stores in content_item.generated_text
   → Creates a job: { type: "generate-visual", content_item_id: ... }
   → On LLM failure: sets generation_status = "failed", job retries per max_attempts

4. VISUAL GENERATION (worker process, picked up from job queue)
   → Renders HTML template with content data
   → Puppeteer screenshots it as static PNG (GIF animation deferred to future)
   → Stores PNG to local Docker volume (served by web process under /assets/)
   → Updates content_item: visual_url = "/assets/<id>.png"
   → Sets generation_status = "ready", review_status = "pending"
   → Only items with review_status = "pending" appear in the human review queue

5. HUMAN REVIEW (web dashboard)
   → User sees items where generation_status = "ready" AND review_status = "pending"
   → Approve: atomic UPDATE review_status = "approved" WHERE review_status = "pending"
     (only proceeds if exactly 1 row affected — prevents duplicate approval from concurrent clicks)
   → Edit: user modifies text → stored in final_text, sets edited_at, then approve
   → Reject: sets review_status = "rejected", user can add review_notes
   → On successful approval: system creates one posts row per active account for this vertical
     with status = "ready", linked to the vertical's default active Twitter account
     (MVP supports exactly one active account per vertical)
     UNIQUE(content_id, account_id) prevents duplicate post rows
   → Enqueues a job: { type: "post-to-platform", post_id: ... }

6. AUTOMATED POSTING (worker process, picked up from job queue)
   → Picks up post-to-platform jobs
   → Resolves PostingStrategy from account config (day 1: Twitter API)
   → Posts tweet with text (final_text if edited, else generated_text) + image attachment
   → On success: sets post.status = "posted", posted_at = now(), platform_post_id = tweet ID
   → On failure: job retries per max_attempts, post.status = "failed" after exhaustion
   → Dashboard shows post status in real-time (posted/failed/pending)
```

### 4.3 Canonical Event Model

Every `DataSourceProvider` adapter must normalize raw API responses into a `DetectedEvent` before trigger rule evaluation. This ensures rules are written against a consistent contract regardless of data source.

```typescript
interface DetectedEvent {
  source: string;           // "coingecko", "exchangerate"
  instrument: string;       // "XAU/USD", "EUR/TRY", "USD/TRY"
  baseCurrency: string;     // "XAU", "EUR", "USD"
  quoteCurrency: string;    // "USD", "TRY", "TRY"
  price: number;            // current price
  previousPrice: number;    // price at start of lookback window
  changePct: number;        // percentage change within lookback window
  observedAt: Date;         // when the price was observed
  rawPayload: Record<string, unknown>;  // original API response (stored in event_data JSONB)
}
```

Trigger rules evaluate against `DetectedEvent` fields. The `rawPayload` is preserved in `content_items.event_data` for prompt enrichment and debugging.

### 4.4 Asset Storage

Generated visuals (PNG files) are stored on a named Docker volume shared between the web and worker processes.

- **Day 1:** Docker volume mounted at `/app/assets/` in both `web` and `worker` containers. Web process serves files under `/assets/` path. `content_items.visual_url` stores the relative path (e.g., `/assets/<content_item_id>.png`).
- **Future:** Pluggable `AssetStore` interface. Swap to S3-compatible storage (AWS S3, MinIO, Cloudflare R2) when deploying to production. The interface: `store(id, buffer) → url` and `resolve(url) → buffer`.

---

## 5. Plugin System

### 5.1 Pattern: Simple Factory/Registry

No DI framework. Idiomatic Node.js: factory functions, maps, explicit wiring.

```typescript
// Interface
interface VisualGenerator {
  generate(data: EventData): Promise<Buffer>;
}

// Registry
const visualGenerators: Record<string, (config: any) => VisualGenerator> = {
  'puppeteer-html': (config) => new PuppeteerVisualGenerator(config),
  'gemini': (config) => new GeminiVisualGenerator(config),
};

// Factory
function createVisualGenerator(name: string, config: any): VisualGenerator {
  const factory = visualGenerators[name];
  if (!factory) throw new Error(`Unknown visual generator: ${name}`);
  return factory(config);
}
```

Shared dependencies (DB pool, logger) are passed explicitly into factories:

```typescript
const db = createDbPool(config.database);
const logger = createLogger(config.logging);

const contentGenerators: Record<string, (config: any) => ContentGenerator> = {
  'claude': (config) => new ClaudeContentGenerator(config, logger),
  'openai': (config) => new OpenAIContentGenerator(config, logger),
};
```

### 5.2 Plugin Interfaces

| Interface | Day 1 Implementation | Future Options |
|---|---|---|
| `DataSourceProvider` | CoinGecko, ExchangeRateHost | TCMB, MetalPriceAPI, RSS feeds, scrapers |
| `ContentGenerator` | Claude or OpenAI (text) | Any LLM, per-model selection (Haiku vs Sonnet) |
| `VisualGenerator` | HTML/CSS → Puppeteer screenshot | Gemini/Imagen 3, Canva API |
| `PostingStrategy` | Twitter/X API (pay-per-use) | Instagram API, TikTok API, manual-assisted fallback |
| `JobQueue` | Postgres-backed table | BullMQ/Redis, RabbitMQ |
| `MetricsParser` | (not in MVP) | TwitterMetricsParser, TikTokMetricsParser, etc. |

### 5.3 Vertical Configuration and Source of Truth

Configuration has a clear hierarchy — **dedicated tables are the source of truth** for their concern. `verticals.config` stores only inherited defaults and vertical-wide settings that don't belong in a dedicated table.

| Concern | Source of Truth | `verticals.config` role |
|---|---|---|
| Data source polling | `data_sources` table (provider, config, poll_interval_ms) | Stores default `contentGenerator` and `visualGenerator` provider names |
| Trigger conditions | `trigger_rules` table (condition, content_config) | Stores vertical-wide defaults (language, tone, brand voice) |
| Content generation | `content_templates` table (prompt, generation_config) | — |
| Account/platform targeting | `accounts` table (platform, language, market) | — |
| Posting strategy | `accounts.config` JSONB (per-account posting config, e.g. `{"postingStrategy": "twitter-api"}`) | — |

**`verticals.config` example — defaults only:**

```json
{
  "defaults": {
    "contentGenerator": { "provider": "claude", "model": "haiku" },
    "visualGenerator": { "provider": "puppeteer-html" },
    "language": "en",
    "tone": "informative",
    "brandVoice": "data-driven, concise, no hype"
  }
}
```

**Resolution order:** Template-level `generation_config` → vertical-level `config.defaults` → system defaults. More specific always wins.

---

## 6. Data Model

### 6.1 Design Principles

- **Vertical-agnostic:** No column knows what "Gold/Forex" is. Everything vertical-specific lives in JSONB.
- **Platform-agnostic:** Platform-specific data (metrics formats, content constraints, credentials) lives in JSONB, resolved by factory pattern in code.
- **Template-driven:** Content templates are DB rows, not code. New prompts, formats, and categories are added without deploys.
- **Account-aware:** One vertical can have multiple accounts (e.g., Instagram EN + Instagram TR). Posts link to accounts, not bare platforms.
- **Future-ready:** Schema supports multi-vertical, multi-platform, multi-account, A/B testing, and learning engine without rewrites — just additive `CREATE TABLE`.

### 6.2 Phase 1 Schema (MVP)

```sql
-- Vertical hierarchy (self-referencing for sub-verticals)
CREATE TABLE verticals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id       UUID REFERENCES verticals(id),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    depth           INT NOT NULL DEFAULT 0,  -- 0 = root, 1 = sub-vertical
    config          JSONB NOT NULL DEFAULT '{}',  -- plugin configuration, inherits from parent
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Platform accounts (one vertical can have many accounts)
CREATE TABLE accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vertical_id     UUID NOT NULL REFERENCES verticals(id),
    platform        TEXT NOT NULL,  -- "twitter", "instagram", "tiktok", "youtube"
    name            TEXT NOT NULL,  -- "Gold Forex EN", "Altın Döviz TR"
    language        TEXT NOT NULL,  -- "en", "tr", "vi"
    market          TEXT NOT NULL DEFAULT 'global',  -- "global", "turkey", "sea"
    credentials     JSONB NOT NULL DEFAULT '{}',  -- API keys/tokens for automated posting (Twitter OAuth, etc.)
    config          JSONB NOT NULL DEFAULT '{}',  -- platform-specific settings
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- External data source configurations
CREATE TABLE data_sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vertical_id     UUID NOT NULL REFERENCES verticals(id),
    provider        TEXT NOT NULL,  -- "coingecko", "exchangerate", etc.
    config          JSONB NOT NULL DEFAULT '{}',
    poll_interval_ms INT NOT NULL DEFAULT 60000,
    status          TEXT NOT NULL DEFAULT 'active',
    last_polled_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event trigger rules
CREATE TABLE trigger_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vertical_id     UUID NOT NULL REFERENCES verticals(id),
    name            TEXT NOT NULL,
    condition       JSONB NOT NULL,  -- canonical shape: { "match": { "source": "coingecko", "instrument": "XAU/USD" }, "predicate": { "field": "changePct", "operator": "gt", "value": 1.0 } }
                                       -- "match" filters which DetectedEvents this rule applies to (all fields optional, omitted = match any)
                                       -- "predicate" evaluates against matching events; MVP supports single predicate only (compound predicates deferred)
    fire_mode       TEXT NOT NULL DEFAULT 'threshold_cross',  -- "threshold_cross", "stateful_true", "every_poll"
    cooldown_ms     INT NOT NULL DEFAULT 3600000,  -- minimum ms between firings (default: 1 hour)
    lookback_window_ms INT NOT NULL DEFAULT 300000,  -- window for change calculation (default: 5 min)
    content_config  JSONB NOT NULL DEFAULT '{}',  -- which templates/layers to activate
    last_fired_at   TIMESTAMPTZ,  -- dedup: when this rule last fired
    enabled         BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Content template catalog
CREATE TABLE content_templates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vertical_id         UUID NOT NULL REFERENCES verticals(id),
    name                TEXT NOT NULL,  -- "gold-price-alert", "gold-historical-comparison"
    category            TEXT NOT NULL,  -- "real-time-event", "historical-context", "poll", "tip"
    content_layer       TEXT NOT NULL,  -- "L1", "L2", "L3", "L4", "L5"
    platform            TEXT,  -- null = all platforms
    prompt_template     TEXT NOT NULL,  -- LLM prompt with {{placeholders}}
    visual_template     JSONB NOT NULL DEFAULT '{}',  -- visual generator + template config
    generation_config   JSONB NOT NULL DEFAULT '{}',  -- model, temperature, tone, language
    tags                JSONB NOT NULL DEFAULT '[]',  -- ["urgent", "data-driven", "interactive"]
    enabled             BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Generated content instances
CREATE TABLE content_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vertical_id     UUID NOT NULL REFERENCES verticals(id),
    template_id     UUID REFERENCES content_templates(id),
    event_data      JSONB NOT NULL DEFAULT '{}',  -- raw event that triggered generation
    generated_text  TEXT,
    visual_url      TEXT,  -- relative path to generated PNG (e.g., /assets/<id>.png)
    generation_status TEXT NOT NULL DEFAULT 'generating',  -- "generating", "ready", "failed"
    review_status   TEXT NOT NULL DEFAULT 'draft',  -- "draft", "pending", "approved", "rejected"
    final_text      TEXT,  -- edited text (if user modified generated_text during review)
    review_notes    TEXT,
    edited_at       TIMESTAMPTZ,
    ai_config       JSONB NOT NULL DEFAULT '{}',  -- exact model, prompt, params used (for A/B tracking)
    cost            JSONB NOT NULL DEFAULT '{}',  -- { "api_tokens": 150, "generation_time_ms": 2300 }
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at     TIMESTAMPTZ
);

-- Platform-specific posts (linked to accounts, not bare platforms)
-- Approval is atomic: UPDATE content_items SET review_status = 'approved' WHERE id = $1 AND review_status = 'pending'
--   Only if the UPDATE affects 1 row, INSERT into posts. This prevents duplicate posts from concurrent approvals.
CREATE TABLE posts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id      UUID NOT NULL REFERENCES content_items(id),
    account_id      UUID NOT NULL REFERENCES accounts(id),
    status          TEXT NOT NULL DEFAULT 'ready',  -- "ready", "posted", "failed", "skipped"
    posted_at       TIMESTAMPTZ,
    platform_post_id TEXT,  -- native post ID from the platform (when available)
    metrics         JSONB NOT NULL DEFAULT '{}',  -- platform-specific: { views, likes, shares, ... }
    cost            JSONB NOT NULL DEFAULT '{}',  -- posting cost if using paid API
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(content_id, account_id)  -- prevents duplicate post rows from concurrent/repeated approvals
);

-- Job queue (pluggable interface, day-1 Postgres implementation)
--
-- Dequeue contract:
--   SELECT ... WHERE status = 'pending' AND scheduled_at <= now()
--     ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LIMIT 1
--
-- On claim:
--   SET status = 'processing', locked_by = worker_id, locked_at = now(),
--       started_at = now(), lease_expires_at = now() + lease_duration
--   (lease_duration per job type: poll-data-source = 60s, generate-content = 5min, generate-visual = 5min)
--
-- On complete:
--   SET status = 'completed', completed_at = now()
--
-- On failure (note: attempts + 1 used in ALL expressions to avoid off-by-one):
--   SET attempts = attempts + 1,
--       status = CASE WHEN (attempts + 1) >= max_attempts THEN 'failed' ELSE 'pending' END,
--       scheduled_at = now() + ((attempts + 1) * interval '30 seconds'),  -- backoff: 30s, 60s, 90s
--       locked_by = NULL, locked_at = NULL, lease_expires_at = NULL
--
-- Stale job recovery (reaper runs every 60s in worker process):
--   Jobs WHERE status = 'processing' AND lease_expires_at < now()
--   are reset: SET status = 'pending', locked_by = NULL, locked_at = NULL, lease_expires_at = NULL
--   Workers may extend leases for legitimately long jobs by updating lease_expires_at before expiry
CREATE TABLE job_queue (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            TEXT NOT NULL,  -- "poll-data-source", "generate-content", "generate-visual"
    payload         JSONB NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'pending',  -- "pending", "processing", "completed", "failed"
    attempts        INT NOT NULL DEFAULT 0,
    max_attempts    INT NOT NULL DEFAULT 3,
    locked_by       TEXT,  -- worker instance identifier
    locked_at       TIMESTAMPTZ,  -- when the worker claimed this job
    lease_expires_at TIMESTAMPTZ,  -- renewable lease; reaper reclaims expired leases
    scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    error           JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_content_items_review ON content_items(review_status) WHERE generation_status = 'ready' AND review_status = 'pending';
CREATE INDEX idx_posts_status ON posts(status) WHERE status = 'ready';
CREATE INDEX idx_job_queue_pending ON job_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_job_queue_stale ON job_queue(lease_expires_at) WHERE status = 'processing';
CREATE INDEX idx_data_sources_poll ON data_sources(last_polled_at) WHERE status = 'active';
CREATE INDEX idx_accounts_vertical ON accounts(vertical_id);
CREATE INDEX idx_content_templates_vertical ON content_templates(vertical_id);
CREATE INDEX idx_trigger_rules_vertical ON trigger_rules(vertical_id) WHERE enabled = true;
```

### 6.3 Future Schema (additive, no rewrites)

These tables will be added in later sub-projects. They connect via FKs to the Phase 1 tables.

**Learning & Optimization (Sub-projects #5, #7):**

- `patterns` — discovered correlations ("L1 + real-time + twitter + gold → high engagement"). Fields: conditions (JSONB), outcome (JSONB), confidence, sample_size, vertical_id (nullable for cross-vertical patterns).
- `experiments` — formal A/B test definitions. Fields: template_ids[], split_config (JSONB), status, results (JSONB).
- `prompt_versions` — track prompt evolution per template. Fields: template_id (FK), version, prompt_text, active, performance (JSONB).

**Audience & Monetization (Sub-project #6):**

- `audience_segments` — discovered audience clusters. Fields: vertical_id, platform, segment_name, signals (JSONB), monetization (JSONB).
- `affiliate_links` — tracking links per vertical/platform. Fields: vertical_id, provider, url, utm_config (JSONB).
- `conversions` — attributed revenue events. Fields: link_id (FK), post_id (FK), event_type, revenue, attribution (JSONB).

**Campaigns & Strategy:**

- `campaigns` — strategic groupings. Fields: vertical_id, platform, strategy (JSONB), active_templates[], budget (JSONB), performance (JSONB).

### 6.4 Analytics Approach

Time-based analytics (time of day, day of week, seasonality) are computed at query time from `TIMESTAMPTZ` columns. No dimension tables in Phase 1-2.

**Growth path:**

| Stage | Trigger | Approach |
|---|---|---|
| Phase 1-2 | < 100K rows | Raw Postgres queries, compute dimensions on the fly |
| Step 1 | Queries slow (~500K+ rows) | Materialized views in Postgres, refresh daily |
| Step 2 | Complex cross-vertical analytics | dbt + Postgres (SQL transforms, same database) |
| Step 3 | Serious scale | ClickHouse (column-oriented, self-hosted) or BigQuery (managed) |

---

## 7. Bootstrap & Seed Data

### 7.1 Database

PostgreSQL runs externally (not in Docker Compose). The application reads connection config from environment variables (e.g., `DATABASE_URL` or individual `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`).

### 7.2 Migrations

Managed by **Drizzle Kit**. Schema is defined as TypeScript in the codebase. `drizzle-kit generate` produces SQL migration files. Migrations run via `drizzle-kit migrate` (or programmatically on app startup).

### 7.3 Seed Data

Seed data is a **standalone SQL file** (e.g., `db/seed.sql`), separate from migrations. It is NOT auto-run — the developer runs it manually when setting up a new environment.

**Seed data for Gold/Forex vertical creates:**

- 1 vertical: `gold-forex` (slug: `gold-forex`, status: `active`)
- 1 account: `Gold Forex EN` (platform: `twitter`, language: `en`, market: `global`)
- 2 data sources: CoinGecko (gold/XAU price, 60s interval) and exchangerate.host (USD/TRY + EUR/TRY, 300s interval)
- 2 trigger rules: "Gold moves >1% in 5 min" and "USD/TRY moves >0.5% in 5 min" (with 1-hour cooldown, threshold_cross mode)
- 2+ content templates: at minimum one L1 "price-alert" template and one L2 "historical-context" template, each with prompt_template and visual_template config

---

## 8. Dashboard (Web Process)

### 8.1 Purpose

Mobile-responsive web dashboard for human content review. The primary interface for the MVP — all interaction happens here.

### 8.2 Core Screens

**Review Queue:**
- List of pending content items with text preview + visual thumbnail
- Approve / Edit / Reject actions
- Filter by vertical, template category, content layer
- Sort by creation time (newest first)

**Post Monitor:**
- Shows all posts with their status: pending (queued for posting), posted (live on platform), failed (with error details)
- For posted items: shows platform_post_id and posted_at timestamp
- For failed items: shows error, option to retry
- Posting history with filters by status

**Vertical Management (basic):**
- View configured verticals, data sources, trigger rules
- Enable/disable verticals and rules
- View content templates

### 8.3 Future Dashboard Additions (not in MVP)

- Metrics/analytics views (after Sub-project #2)
- A/B test management (after Sub-project #5)
- Affiliate link management (after Sub-project #6)
- Telegram bot integration: sends link to dashboard when new items are pending

---

## 9. Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| DI approach | Simple factory/registry | Idiomatic Node.js, more AI-coding-friendly, wide but shallow dependency graph |
| Job queue | Postgres table, pluggable interface | Zero extra infra day 1, swap to BullMQ/Redis later |
| Visual gen | Puppeteer HTML screenshot | Zero cost, deterministic, proven pattern |
| Posting | Automated via Twitter/X API (pay-per-use) | ~cents per post, fully automated pipeline end-to-end |
| Schema philosophy | JSONB for all variable data | Vertical-agnostic, platform-agnostic, no rewrites on expansion |
| Vertical hierarchy | parent_id self-reference, max 2 levels | Simple, covers known use cases (Dating → Men/Women, Fitness → subverticals) |
| Multi-account | Dedicated accounts table | One vertical can have multiple platform/language/market combinations |
| Analytics | Query-time dimension computation | No data warehouse needed at MVP scale |
| Asset storage | Docker volume, served by web process | Pluggable AssetStore interface for future S3/R2 |
| Auth | Minimal (single shared secret or basic auth) | Single-user MVP, no full auth system. Revisit for multi-user/B2B. |
| Visual format | Static PNG only | GIF animation deferred — explicit future design decision when needed |

---

## 10. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| LLM generates low-quality content | Bad content posted, audience loss | Human review catches everything in MVP. Track ai_config to learn which models/prompts work. |
| Puppeteer crashes in worker | Visual generation stalls | Worker process isolation from dashboard. Job queue retries (max_attempts = 3). |
| Data source API rate limits | Missed events | Respect poll intervals in config. Exponential backoff. Store last_polled_at to resume. |
| JSONB queries slow as data grows | Dashboard/analytics latency | Add GIN indexes on JSONB columns. Materialized views when needed. |
| Twitter/X API rate limits or pricing changes | Posts delayed or cost increases | Pluggable PostingStrategy — can fall back to manual-assisted. Monitor API costs. Respect rate limits with backoff. |
| Schema needs change we didn't anticipate | Migration pain | JSONB columns absorb most changes without schema migration. Core tables are minimal. |

---

## 11. Success Criteria for Sub-project #1

- [ ] `docker compose up` starts web + worker (connects to external Postgres via env vars)
- [ ] Drizzle migrations create all Phase 1 tables; standalone `db/seed.sql` populates Gold/Forex vertical, account, data sources, trigger rules, content templates
- [ ] System polls CoinGecko and exchangerate.host on configured intervals
- [ ] Data source adapters normalize responses into DetectedEvent canonical format
- [ ] Empty/malformed API responses are logged and skipped without creating jobs
- [ ] Trigger rules fire correctly on threshold crossing with cooldown enforcement
- [ ] Duplicate triggers are prevented (same rule cannot fire within cooldown window)
- [ ] Events matching no rule are logged as ignored
- [ ] AI generates tweet text from event data using configured LLM
- [ ] Puppeteer generates static PNG visual card from HTML template
- [ ] Content progresses through generation_status: generating → ready (or failed)
- [ ] Only fully generated content (generation_status = "ready") appears in review queue
- [ ] User can approve/edit/reject content in mobile-responsive dashboard
- [ ] Editing stores final_text separately from generated_text (preserves original for learning)
- [ ] Approved content creates a posts row and enqueues a post-to-platform job
- [ ] Worker picks up post job and posts to Twitter/X via API (text + image)
- [ ] Post status updates to "posted" with platform_post_id on success, "failed" with error on failure
- [ ] Dashboard shows post status in real-time (posted/failed/pending)
- [ ] Job queue handles concurrent workers safely (FOR UPDATE SKIP LOCKED)
- [ ] Stale jobs are recovered automatically (reaper process)
- [ ] Data model is fully vertical-agnostic (no Gold/Forex-specific columns)
