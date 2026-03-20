# Architecture Decision Records

## ADR-001: Monolith with Worker Separation over Microservices

**Date:** 2026-03-17
**Status:** Accepted

**Context:** The system needs process isolation between the web dashboard and background jobs (Puppeteer, LLM calls) but is built by a 1-2 person team targeting an MVP.

**Decision:** Single shared codebase with two entry points (web + worker) communicating through PostgreSQL. Not microservices.

**Consequences:**
- Fast development: shared types, no inter-service communication overhead
- Puppeteer/LLM crashes isolated from dashboard
- Cannot scale web and worker independently without extracting services later
- Job queue is a Postgres table (no message broker infra)

---

## ADR-002: Simple Factory/Registry over DI Framework

**Date:** 2026-03-17
**Status:** Accepted

**Context:** All major components (data sources, LLM, visual gen, posting, job queue, trigger evaluators) must be pluggable per vertical. Considered tsyringe, InversifyJS, and no-framework approaches.

**Decision:** Simple factory/registry pattern — `Record<string, Factory>` maps resolved by name from vertical config JSONB. No DI framework.

**Consequences:**
- Idiomatic Node.js, more AI-coding-agent friendly (more training data)
- Manual wiring of dependencies (acceptable for wide-but-shallow dependency graph)
- No automatic lifecycle management (singleton/transient) — managed explicitly
- Easy for any developer to understand without framework knowledge
- Used for all plugin types: DataSourceProvider, ContentGenerator, VisualGenerator, PostingStrategy, TriggerEvaluator, JobQueue, AssetStore

---

## ADR-003: PostgreSQL + JSONB for All Variable Data

**Date:** 2026-03-17
**Status:** Accepted

**Context:** The system must support multiple verticals, platforms, and content formats without schema rewrites. Each vertical has different data source payloads, trigger conditions, content formats, and metrics shapes.

**Decision:** Core tables use fixed columns for common fields. All vertical-specific, platform-specific, and variable data lives in JSONB columns. Drizzle Kit for schema-as-TypeScript migrations.

**Consequences:**
- Schema is vertical-agnostic — new verticals require zero migrations
- GIN indexes available for JSONB query performance
- No compile-time type safety on JSONB contents (mitigated by Zod validation in code)
- Dedicated tables are source of truth for their concern; `verticals.config` stores only inherited defaults

---

## ADR-004: Postgres-backed Job Queue over Redis/BullMQ

**Date:** 2026-03-17
**Status:** Accepted

**Context:** Background jobs need reliable scheduling, retry with backoff, and lease-based concurrency safety. Options: BullMQ (Redis), RabbitMQ, or Postgres table.

**Decision:** Job queue is a Postgres table with `FOR UPDATE SKIP LOCKED` dequeuing and `lease_expires_at` for stale job recovery. Interface is pluggable for future BullMQ swap.

**Consequences:**
- Zero additional infrastructure (no Redis)
- Slightly less throughput than dedicated queue (acceptable at MVP scale)
- Lease-based expiry prevents both premature reaping and stuck jobs
- Can swap to BullMQ/Redis by implementing the `JobQueue` interface without touching business logic

---

## ADR-005: Automated Posting via Platform APIs

**Date:** 2026-03-17 (revised 2026-03-19)
**Status:** Accepted

**Context:** As of January 2026, X moved to pay-per-use API pricing (~cents per post). SP#4 expands posting from Twitter-only to 10 platforms: Twitter/X, Instagram, LinkedIn, Pinterest, Telegram, Newsletter, TikTok, YouTube, Reddit, Blog.

**Decision:** Automated posting via platform APIs from day one. Each platform is a `PostingStrategy` plugin resolved per account from `accounts.config.postingStrategy`. Platforms requiring video (TikTok, YouTube) or long-form content (Reddit, Blog) ship as stubs until those content formats are built. All platforms support dry-run mode for testing.

**Consequences:**
- Fully automated end-to-end pipeline across 10 platforms
- Per-platform input validation catches configuration errors before posting
- Platform-aware routing: `content_templates.platform` field filters which accounts receive posts
- Stubs for video/long-form platforms prevent premature integration before content pipeline supports those formats
- In-house per-platform plugins (~100-200 lines each) chosen over Postiz — lower cost, simpler ops, no external dependency

---

## ADR-006: Drizzle Kit for Database Migrations

**Date:** 2026-03-17
**Status:** Accepted

**Context:** Need TypeScript-native schema management with good JSONB support. Considered Prisma, Knex, node-pg-migrate.

**Decision:** Drizzle Kit — schema defined as TypeScript, auto-generates SQL migration files, lightweight runtime.

**Consequences:**
- Type-safe schema definition and queries
- Generated SQL migration files are inspectable and editable
- Excellent JSONB support
- Seed data managed separately as standalone SQL file (not part of migrations)

---

## ADR-007: External PostgreSQL (Not Dockerized)

**Date:** 2026-03-17
**Status:** Accepted

**Context:** Developer preference — user wants to manage their own PostgreSQL instance and provide connection config via environment variables.

**Decision:** Postgres is NOT in Docker Compose. App reads `VIRAL_DATABASE_URL` from environment. Docker Compose runs only `web` and `worker`.

**Consequences:**
- Developer has full control over Postgres configuration and version
- Must have Postgres installed/accessible locally before running the app
- Seed data provided as standalone `db/seed.sql` for manual execution

---

## ADR-008: Pluggable HTML Visual Templates from Filesystem

**Date:** 2026-03-17 (revised 2026-03-18)
**Status:** Accepted

**Context:** Original MVP had a hardcoded `renderPriceCard()` method. Multi-vertical support requires different visual styles per vertical (price cards, tip cards, quote cards, stat cards).

**Decision:** HTML templates stored in `templates/visuals/` directory, loaded by name from `content_templates.visualTemplate.template` field. Templates use `{{placeholder}}` syntax filled by shared `fillHtmlTemplate()` with HTML escaping. Adding a new visual = dropping an HTML file, no code change.

**Consequences:**
- Version controlled, easy to design, AI-coding-agent friendly
- Zero cost per image (Puppeteer screenshots, no API call)
- HTML escaping prevents broken rendering from LLM output containing `<`, `>`, `&`
- CSS dimensions hardcoded in templates (must match `visualTemplate.config` — documented constraint)
- Future optimization: replace Puppeteer with Satori for 5x speed improvement (see backlog)

---

## ADR-009: Generic DetectedEvent with Pluggable Trigger Evaluation

**Date:** 2026-03-18
**Status:** Accepted

**Context:** SP#1's `DetectedEvent` had financial-specific fields (price, changePct, instrument). Non-financial verticals (Fitness, Dating) need different event shapes. Trigger evaluation needed compound predicates and per-vertical customization.

**Decision:** Generic `DetectedEvent` with `data: Record<string, unknown>` for all vertical-specific fields. `TriggerEvaluator` interface with `DefaultTriggerEvaluator` supporting compound predicates (AND/OR), multiple fire modes (`threshold_cross`, `stateful_true`, `every_poll`, `scheduled`), and per-vertical override via registry.

**Consequences:**
- Any data shape works — financial, fitness, dating, or custom
- Compound predicates enable complex rules ("price > 70000 AND changePct > 1%")
- `threshold_cross` tracks state transitions via `lastPredicateResult` column
- Vertical-specific evaluators can be added without modifying the default
- `content_config` on trigger rules explicitly maps to template names — no fallback to "all templates"

---

## ADR-010: Cron-based Scheduled Triggers

**Date:** 2026-03-18
**Status:** Accepted

**Context:** Content-first verticals (Fitness, Dating) don't rely on real-time API events. They need time-based content generation ("post a workout tip every day at 8AM").

**Decision:** `fire_mode: 'scheduled'` with cron expressions in `trigger_rules.schedule`. Worker runs a 60-second cron check loop using `cron-parser`. Claims are transactional (`FOR UPDATE SKIP LOCKED` + job insert + schedule advance in one DB transaction). Missed firings are skipped on restart (no catch-up).

**Consequences:**
- Schedule-driven verticals work without any data source polling
- Durable: `next_scheduled_at` persisted in DB, survives worker restarts
- Concurrency-safe: transactional claim prevents duplicate firings
- Invalid cron expressions propagate errors (transaction rolls back, no infinite re-firing)

---

## ADR-011: AI-Assigned Content Tags

**Date:** 2026-03-18
**Status:** Accepted

**Context:** The learning engine (SP#5) needs to correlate content attributes with performance. Template-level categorization is too coarse — individual generated content items vary in theme even within the same template.

**Decision:** LLM generates tags alongside text using a `Tweet: ... Tags: ...` response format. Tags are parsed by shared `parseLlmResponse()`, validated against the vertical's `tagVocabulary`, and stored in `content_items.tags` JSONB.

**Consequences:**
- Per-item tagging enables fine-grained learning ("motivation posts get 3x engagement in Fitness")
- Tag vocabulary is per-vertical (configurable in `verticals.config.defaults.tagVocabulary`)
- Graceful degradation: if LLM doesn't follow format, content is stored untagged
- Multi-line tag parsing supported (comma and newline delimiters)

---

## ADR-012: Centralized Constants over Magic Strings

**Date:** 2026-03-19
**Status:** Accepted

**Context:** Fire modes, generation statuses, review statuses, job types, and template selection modes were scattered as string literals across 15+ files. Any typo or inconsistency would be a silent bug.

**Decision:** All domain constants centralized in `src/shared/constants.ts` and imported throughout. Fire modes, statuses, job types, and template selection use typed `as const` objects.

**Consequences:**
- Single source of truth for all status strings
- TypeScript catches typos at compile time
- Easy to add new statuses/modes in one place
- Raw SQL queries (job queue, scheduler) still use string literals (unavoidable)

---

## ADR-013: In-House Multi-Platform Posting over Postiz

**Date:** 2026-03-19
**Status:** Accepted

**Context:** Evaluated Postiz (open-source, 17+ platforms) vs building per-platform `PostingStrategy` plugins in-house. Postiz cloud costs $29+/month with 400 post limit. Postiz self-hosted requires Temporal (operational complexity).

**Decision:** Build in-house. Each platform is a `PostingStrategy` plugin (~100-200 lines). The `PostInput` interface includes media metadata (type, dimensions, MIME, duration) and `platformMeta` for platform-specific fields. Each plugin validates inputs against platform constraints before posting.

**Consequences:**
- Zero external dependency for posting
- Each plugin is self-contained and independently testable
- Per-platform validation catches configuration errors before API calls
- Platforms requiring video (TikTok, YouTube) or long-form content (Reddit, Blog) ship as stubs
- Adding a new platform is a single file addition + registry registration
