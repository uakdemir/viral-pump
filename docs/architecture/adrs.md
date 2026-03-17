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

**Context:** All major components (data sources, LLM, visual gen, posting, job queue) must be pluggable per vertical. Considered tsyringe, InversifyJS, and no-framework approaches.

**Decision:** Simple factory/registry pattern — `Record<string, Factory>` maps resolved by name from vertical config JSONB. No DI framework.

**Consequences:**
- Idiomatic Node.js, more AI-coding-agent friendly (more training data)
- Manual wiring of dependencies (acceptable for wide-but-shallow dependency graph)
- No automatic lifecycle management (singleton/transient) — managed explicitly
- Easy for any developer to understand without framework knowledge

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

## ADR-005: Automated Posting via Twitter/X API (Pay-Per-Use)

**Date:** 2026-03-17 (revised)
**Status:** Accepted

**Context:** As of January 2026, X moved to pay-per-use API pricing. Posting a tweet costs ~cents, not the $100/month fixed tier that existed previously. At MVP volume (~50 posts/day), API costs are negligible.

**Decision:** Automated posting to Twitter/X via API from day one. On content approval, a `post-to-platform` job is enqueued and the worker posts via the Twitter API. Posting strategy remains pluggable — manual-assisted fallback exists in the `PostingStrategy` interface but is not built for day 1.

**Consequences:**
- Fully automated end-to-end pipeline (detect → generate → review → post)
- Negligible API cost (~cents per post)
- Requires Twitter/X API credentials (OAuth) configured per account
- Programmatic access to tweet IDs for future metrics collection (Sub-project #2)
- If X changes pricing or rate-limits aggressively, can swap to manual-assisted fallback

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

**Decision:** Postgres is NOT in Docker Compose. App reads `DATABASE_URL` (or `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD`) from environment. Docker Compose runs only `web` and `worker`.

**Consequences:**
- Developer has full control over Postgres configuration and version
- Must have Postgres installed/accessible locally before running the app
- Seed data provided as standalone `db/seed.sql` for manual execution

---

## ADR-008: Static PNG Only for MVP Visual Generation

**Date:** 2026-03-17
**Status:** Accepted

**Context:** Original vision included GIF animations. Puppeteer can generate both PNG screenshots and multi-frame GIFs, but GIF adds complexity (frame capture, encoding, file size management).

**Decision:** MVP generates static PNG cards only. GIF animation is explicitly deferred to a future design decision.

**Consequences:**
- Simpler implementation — single Puppeteer screenshot per content item
- May limit visual engagement compared to animated content
- Future GIF support requires its own design decision (frame count, encoding lib, etc.)
