# ViralEngine — Architecture

## System Overview

ViralEngine is an AI-powered content pipeline that detects real-time events, generates platform-optimized content (text + visuals), and assists human operators in posting to social media. The system is designed for multi-vertical, multi-platform, multi-account operation from day one.

## Architectural Style

**Monolith with Worker Separation** — a shared TypeScript codebase with two process entry points:

- **Web Process:** REST API + React dashboard for human review and post management
- **Worker Process:** Background jobs for event detection, content generation, visual generation, and scheduling

Both processes share the same codebase, types, and database. They communicate exclusively through PostgreSQL (shared tables + job queue). No message broker required.

## Layers

```
┌─────────────────────────────────────────────────────┐
│                  Presentation Layer                   │
│  React Dashboard (mobile-responsive)                  │
│  REST API (Express/Fastify)                           │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│                  Application Layer                    │
│  Pipeline Orchestration (scheduler, event detection)  │
│  Review Workflow (approve/edit/reject → post)          │
│  Job Queue Consumer/Producer                          │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│                    Domain Layer                       │
│  DetectedEvent model (canonical event format)         │
│  Trigger Rule evaluation engine                       │
│  Content generation orchestration                     │
│  Review state machine (draft→pending→approved/rejected)│
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│                 Plugin Layer (DI)                     │
│  DataSourceProvider  │  ContentGenerator              │
│  VisualGenerator     │  PostingStrategy               │
│  JobQueue            │  AssetStore                    │
│  (Simple factory/registry pattern — no DI framework)  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│               Infrastructure Layer                    │
│  PostgreSQL + JSONB (Drizzle ORM/Kit)                 │
│  Puppeteer (visual generation)                        │
│  External APIs (CoinGecko, exchangerate.host)         │
│  LLM APIs (Claude, OpenAI)                            │
│  Docker volume (asset storage)                        │
└─────────────────────────────────────────────────────┘
```

## Key Components

### Web Process
- **REST API:** CRUD for verticals, accounts, data sources, trigger rules, content templates. Review workflow endpoints (approve/edit/reject). Post monitoring endpoints.
- **Static asset server:** Serves generated PNGs from shared Docker volume under `/assets/`.
- **React SPA:** Review queue, post monitor, vertical management screens. Mobile-responsive.
- **Auth:** Minimal for MVP — single shared secret or basic auth.

### Worker Process
- **Scheduler:** Polls data sources at configured intervals. Creates `poll-data-source` jobs.
- **Event Detector:** Evaluates trigger rules against normalized `DetectedEvent`s. Enforces cooldown and fire_mode. Creates `generate-content` jobs.
- **Content Generator:** Picks up `generate-content` jobs. Calls LLM API via pluggable `ContentGenerator` interface. Creates `generate-visual` jobs.
- **Visual Generator:** Picks up `generate-visual` jobs. Renders HTML templates via Puppeteer. Stores PNG to Docker volume.
- **Platform Poster:** Picks up `post-to-platform` jobs. Posts to Twitter/X via API (text + image). Updates post status and platform_post_id.
- **Job Reaper:** Periodic (every 60s) — reclaims stale jobs where `lease_expires_at < now()`.

### Plugin System
All major components are behind interfaces resolved by a simple factory/registry pattern. Each vertical configures which implementation to use via JSONB config. No DI framework.

### Database
PostgreSQL with JSONB for all variable/vertical-specific/platform-specific data. Schema managed by Drizzle Kit. Postgres runs externally (not in Docker Compose).

## Data Flow

See `docs/architecture/c4/` for detailed Mermaid diagrams.

## Cross-Cutting Concerns

- **Logging:** Structured JSON logging (e.g., pino). Both processes log to stdout.
- **Configuration:** Environment variables for secrets and connection strings. Database tables for vertical/plugin configuration.
- **Error handling:** Job queue retries with exponential backoff. Malformed data logged and skipped. LLM/Puppeteer failures result in `generation_status = "failed"`.
- **Asset storage:** Docker volume (day 1), pluggable to S3-compatible storage.
