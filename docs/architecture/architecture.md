# ViralEngine — Architecture

## System Overview

ViralEngine is an AI-powered content pipeline that detects real-time events and generates scheduled content, produces platform-optimized text and visuals using AI, queues content for human review, and automatically posts to multiple social media platforms. The system supports multiple verticals (Gold/Forex, Fitness, Dating, and more), multiple platforms (Twitter, Instagram, LinkedIn, Pinterest, Telegram, TikTok, YouTube, Newsletter, Reddit, Blog), and multiple accounts per vertical.

## Architectural Style

**Monolith with Worker Separation** — a shared TypeScript codebase with two process entry points:

- **Web Process:** Fastify REST API + React dashboard for human review and post monitoring
- **Worker Process:** Background jobs for event detection, scheduled trigger firing, content generation, visual generation, multi-platform posting, and job reaping

Both processes share the same codebase, types, and database. They communicate exclusively through PostgreSQL (shared tables + job queue). No message broker required.

## Layers

```
┌─────────────────────────────────────────────────────┐
│                  Presentation Layer                   │
│  React Dashboard (mobile-responsive)                  │
│  REST API (Fastify)                                   │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│                  Application Layer                    │
│  Pipeline Orchestration (scheduler, event detection)  │
│  Cron-based Scheduled Triggers                        │
│  Review Workflow (approve/edit/reject → post)          │
│  Platform-Aware Post Routing                          │
│  Job Queue Consumer/Producer                          │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│                    Domain Layer                       │
│  DetectedEvent model (generic, vertical-agnostic)     │
│  TriggerEvaluator (compound predicates, AND/OR)       │
│  Content generation orchestration + AI tag extraction  │
│  Review state machine (draft→pending→approved/rejected)│
│  Centralized constants (fire modes, statuses, etc.)   │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│                 Plugin Layer (DI)                     │
│  DataSourceProvider  │  ContentGenerator              │
│  VisualGenerator     │  PostingStrategy (10 platforms) │
│  TriggerEvaluator    │  JobQueue                      │
│  AssetStore          │                                │
│  (Simple factory/registry pattern — no DI framework)  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│               Infrastructure Layer                    │
│  PostgreSQL + JSONB (Drizzle ORM/Kit)                 │
│  Puppeteer (visual generation from HTML templates)    │
│  External APIs (CoinGecko, ExchangeRate API)          │
│  LLM APIs (Claude, OpenAI)                            │
│  Platform APIs (Twitter, Instagram, LinkedIn, etc.)   │
│  Docker volume (asset storage)                        │
└─────────────────────────────────────────────────────┘
```

## Key Components

### Web Process
- **REST API (Fastify):** CRUD for verticals, accounts, data sources, trigger rules, content templates. Review workflow endpoints (approve/edit/reject). Post monitoring endpoints.
- **Static asset server:** Serves generated PNGs from shared Docker volume under `/assets/`.
- **React SPA:** Review queue, post monitor, vertical management screens. Mobile-responsive.
- **Auth:** Minimal for MVP — single shared secret or basic auth.

### Worker Process
- **Scheduler:** Polls data sources at configured intervals. Runs cron check loop every 60s for scheduled triggers. Initializes `next_scheduled_at` on startup.
- **Event Detector:** Evaluates trigger rules against generic `DetectedEvent`s via pluggable `TriggerEvaluator` interface. Supports compound predicates (AND/OR), multiple fire modes (`threshold_cross`, `stateful_true`, `every_poll`), cooldown enforcement, and `content_config` template selection. Validates all template names before consuming cooldown. Atomic: fire + enqueue in one transaction.
- **Content Generator:** Picks up `generate-content` jobs. Calls LLM API via pluggable `ContentGenerator` interface. Assembles context (event-driven vs scheduled branches). Extracts AI-assigned tags from LLM response. Supports `skipVisual` for text-only content.
- **Visual Generator:** Picks up `generate-visual` jobs. Loads named HTML templates from `templates/visuals/`. Fills placeholders with HTML-escaped context. Renders to PNG via Puppeteer.
- **Platform Poster:** Picks up `post-to-platform` jobs. Resolves `PostingStrategy` per account from registry. Validates input against platform constraints before posting. Supports 10 platforms (6 full implementations, 4 stubs).
- **Job Reaper:** Periodic (every 60s) — reclaims stale jobs where `lease_expires_at < now()`.

### Plugin System
All major components are behind interfaces resolved by a simple factory/registry pattern. Each vertical configures which implementation to use via JSONB config. No DI framework. Plugin types:

| Interface | Implementations |
|---|---|
| `DataSourceProvider` | CoinGecko, ExchangeRate API |
| `ContentGenerator` | Claude, OpenAI |
| `VisualGenerator` | Puppeteer HTML (filesystem templates) |
| `PostingStrategy` | Twitter, Instagram, LinkedIn, Pinterest, Telegram, Newsletter, TikTok (stub), YouTube (stub), Reddit (stub), Blog (stub), Dry-run |
| `TriggerEvaluator` | DefaultTriggerEvaluator (compound predicates + fire modes) |
| `JobQueue` | PostgresJobQueue |
| `AssetStore` | LocalVolumeAssetStore |

### Database
PostgreSQL with JSONB for all variable/vertical-specific/platform-specific data. Schema managed by Drizzle Kit. Postgres runs externally (not in Docker Compose). Connection via `VIRAL_DATABASE_URL` env var.

## Data Flow

See `docs/architecture/c4/` for detailed Mermaid diagrams.

## Cross-Cutting Concerns

- **Logging:** Structured JSON logging via pino. Both processes log to stdout. Poll results, rule evaluations, and trigger firings are logged for observability.
- **Configuration:** Environment variables for secrets and connection strings. Database tables for vertical/plugin configuration. Centralized constants in `src/shared/constants.ts`.
- **Error handling:** Job queue retries with exponential backoff. Malformed data logged and skipped. LLM/Puppeteer failures result in `generation_status = "failed"`. Platform validation failures mark posts as failed without retry (configuration errors). Invalid cron expressions propagate errors to roll back transactions.
- **Asset storage:** Docker volume (day 1), pluggable to S3-compatible storage via `AssetStore` interface.
- **Template system:** Shared `fillPromptTemplate()` (no escaping) and `fillHtmlTemplate()` (HTML escaping) with dot-path resolution. Context assembly branches on trigger type (event-driven vs scheduled).
