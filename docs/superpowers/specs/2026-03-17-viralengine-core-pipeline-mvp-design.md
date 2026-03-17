# ViralEngine — Sub-project #1: Core Pipeline MVP

**Date:** 2026-03-17
**Status:** Draft
**Scope:** Single vertical (Gold/Forex), single platform (Twitter/X), end-to-end content pipeline

---

## 1. Overview

Build an end-to-end content pipeline that detects real-time financial events from multiple APIs, generates AI-powered text and visual content, queues it for human review in a mobile-responsive web dashboard, and assists the user in posting to Twitter/X manually.

This is the foundational sub-project of ViralEngine. It delivers the core loop (detect → generate → review → post) while establishing the plugin architecture and generic data model that all future sub-projects build on.

### What this sub-project delivers

- Event detection from CoinGecko and exchangerate.host APIs
- AI-generated tweet text (Claude or OpenAI) from detected events
- Visual content generation (HTML/CSS → Puppeteer screenshot)
- Web dashboard for content review (approve/edit/reject)
- Manual-assisted posting (copy text, download image, open Twitter compose)
- Generic data model (Postgres + JSONB) designed for multi-vertical, multi-platform, multi-account expansion

### What this sub-project does NOT deliver

- Automated posting via platform APIs (future — cost-dependent)
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
| Visual generation (day 1) | HTML/CSS → Puppeteer screenshot | Zero cost, deterministic, proven pattern (earthquake bot) |
| Visual generation (future) | Gemini / Imagen 3 | Pluggable via DI, configured per vertical |
| LLM (day 1) | Claude or OpenAI | Pluggable per task type and model level |
| Hosting (day 1) | Docker Compose (local) | Deploy decision deferred, target < $200/month |
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

2. EVENT DETECTION (worker process)
   → Evaluates trigger_rules against incoming data
   → Example: "gold_usd change_pct > 1.0" → fire
   → Creates a job: { type: "generate-content", event_data: {...} }

3. CONTENT GENERATION (worker process, picked up from job queue)
   → Selects matching content_template(s) for the event
   → Sends prompt to LLM (Claude/OpenAI) with event data + template
   → Generates text content
   → Creates a job: { type: "generate-visual", content_item_id: ... }

4. VISUAL GENERATION (worker process, picked up from job queue)
   → Renders HTML template with content data
   → Puppeteer screenshots it as PNG/GIF
   → Stores image, updates content_item with visual_url
   → Sets content_item.review_status = "pending"

5. HUMAN REVIEW (web dashboard)
   → User sees pending content items with text + visual preview
   → Approve / Edit / Reject
   → Approved items become available for posting

6. POSTING ASSIST (web dashboard)
   → For approved items: "Copy text" button, "Download image" button
   → "Open Twitter compose" link
   → User posts manually (~30 seconds)
   → User marks as "posted" in dashboard
```

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
| `PostingStrategy` | Manual-assisted (copy + open compose) | Twitter API, Instagram API, TikTok API |
| `JobQueue` | Postgres-backed table | BullMQ/Redis, RabbitMQ |
| `MetricsParser` | (not in MVP) | TwitterMetricsParser, TikTokMetricsParser, etc. |

### 5.3 Vertical Configuration

Each vertical stores its plugin configuration in JSONB. The factory/registry resolves implementations at runtime:

```json
{
  "dataSources": [
    { "provider": "coingecko", "config": { "assets": ["bitcoin", "gold"], "pollIntervalMs": 60000 } },
    { "provider": "exchangerate", "config": { "pairs": ["USD/TRY", "EUR/TRY"], "pollIntervalMs": 300000 } }
  ],
  "contentGenerator": {
    "provider": "claude",
    "model": "haiku",
    "promptTemplate": "vertical-gold-forex-v1"
  },
  "visualGenerator": {
    "provider": "puppeteer-html",
    "template": "price-card-v1"
  },
  "postingStrategy": {
    "provider": "manual-assisted",
    "platform": "twitter"
  }
}
```

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
    credentials     JSONB NOT NULL DEFAULT '{}',  -- encrypted API keys (when automated posting)
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
    condition       JSONB NOT NULL,  -- { "field": "change_pct", "operator": "gt", "value": 1.0 }
    content_config  JSONB NOT NULL DEFAULT '{}',  -- which templates/layers to activate
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
    visual_url      TEXT,  -- path/URL to generated image/GIF
    review_status   TEXT NOT NULL DEFAULT 'pending',  -- "pending", "approved", "rejected", "edited"
    review_notes    TEXT,
    ai_config       JSONB NOT NULL DEFAULT '{}',  -- exact model, prompt, params used (for A/B tracking)
    cost            JSONB NOT NULL DEFAULT '{}',  -- { "api_tokens": 150, "generation_time_ms": 2300 }
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at     TIMESTAMPTZ
);

-- Platform-specific posts (linked to accounts, not bare platforms)
CREATE TABLE posts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id      UUID NOT NULL REFERENCES content_items(id),
    account_id      UUID NOT NULL REFERENCES accounts(id),
    status          TEXT NOT NULL DEFAULT 'ready',  -- "ready", "posted", "failed", "skipped"
    posted_at       TIMESTAMPTZ,
    platform_post_id TEXT,  -- native post ID from the platform (when available)
    metrics         JSONB NOT NULL DEFAULT '{}',  -- platform-specific: { views, likes, shares, ... }
    cost            JSONB NOT NULL DEFAULT '{}',  -- posting cost if using paid API
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Job queue (pluggable interface, day-1 Postgres implementation)
CREATE TABLE job_queue (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            TEXT NOT NULL,  -- "poll-data-source", "generate-content", "generate-visual"
    payload         JSONB NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'pending',  -- "pending", "processing", "completed", "failed"
    attempts        INT NOT NULL DEFAULT 0,
    max_attempts    INT NOT NULL DEFAULT 3,
    scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    error           JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_content_items_review_status ON content_items(review_status) WHERE review_status = 'pending';
CREATE INDEX idx_posts_status ON posts(status) WHERE status = 'ready';
CREATE INDEX idx_job_queue_pending ON job_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_data_sources_poll ON data_sources(last_polled_at) WHERE status = 'active';
CREATE INDEX idx_accounts_vertical ON accounts(vertical_id);
CREATE INDEX idx_content_templates_vertical ON content_templates(vertical_id);
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

## 7. Dashboard (Web Process)

### 7.1 Purpose

Mobile-responsive web dashboard for human content review. The primary interface for the MVP — all interaction happens here.

### 7.2 Core Screens

**Review Queue:**
- List of pending content items with text preview + visual thumbnail
- Approve / Edit / Reject actions
- Filter by vertical, template category, content layer
- Sort by creation time (newest first)

**Post Assist:**
- For approved items: "Copy text" button, "Download image" button, "Open Twitter compose" link
- User posts manually, then marks as "posted" in dashboard
- Shows posting history with status

**Vertical Management (basic):**
- View configured verticals, data sources, trigger rules
- Enable/disable verticals and rules
- View content templates

### 7.3 Future Dashboard Additions (not in MVP)

- Metrics/analytics views (after Sub-project #2)
- A/B test management (after Sub-project #5)
- Affiliate link management (after Sub-project #6)
- Telegram bot integration: sends link to dashboard when new items are pending

---

## 8. Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| DI approach | Simple factory/registry | Idiomatic Node.js, more AI-coding-friendly, wide but shallow dependency graph |
| Job queue | Postgres table, pluggable interface | Zero extra infra day 1, swap to BullMQ/Redis later |
| Visual gen | Puppeteer HTML screenshot | Zero cost, deterministic, proven pattern |
| Posting | Manual-assisted (no Twitter API) | Avoids $100/month API cost before proving revenue |
| Schema philosophy | JSONB for all variable data | Vertical-agnostic, platform-agnostic, no rewrites on expansion |
| Vertical hierarchy | parent_id self-reference, max 2 levels | Simple, covers known use cases (Dating → Men/Women, Fitness → subverticals) |
| Multi-account | Dedicated accounts table | One vertical can have multiple platform/language/market combinations |
| Analytics | Query-time dimension computation | No data warehouse needed at MVP scale |

---

## 9. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| LLM generates low-quality content | Bad content posted, audience loss | Human review catches everything in MVP. Track ai_config to learn which models/prompts work. |
| Puppeteer crashes in worker | Visual generation stalls | Worker process isolation from dashboard. Job queue retries (max_attempts = 3). |
| Data source API rate limits | Missed events | Respect poll intervals in config. Exponential backoff. Store last_polled_at to resume. |
| JSONB queries slow as data grows | Dashboard/analytics latency | Add GIN indexes on JSONB columns. Materialized views when needed. |
| Manual posting becomes tedious at scale | Bottleneck on human | Designed as pluggable PostingStrategy — swap to API-based when revenue justifies cost. |
| Schema needs change we didn't anticipate | Migration pain | JSONB columns absorb most changes without schema migration. Core tables are minimal. |

---

## 10. Success Criteria for Sub-project #1

- [ ] System polls CoinGecko and exchangerate.host on configured intervals
- [ ] Trigger rules fire correctly when price conditions are met
- [ ] AI generates tweet text from event data using configured LLM
- [ ] Puppeteer generates visual card from HTML template
- [ ] Content appears in dashboard review queue
- [ ] User can approve/edit/reject content
- [ ] Approved content provides copy/download/compose-link for manual posting
- [ ] User can mark posts as "posted"
- [ ] All of the above runs via `docker compose up`
- [ ] Data model is fully vertical-agnostic (no Gold/Forex-specific columns)
