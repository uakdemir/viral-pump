# Core Pipeline MVP — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an end-to-end content pipeline for the Gold/Forex vertical on Twitter/X: event detection → AI content generation → visual generation → human review dashboard → automated posting via Twitter/X API.

**Architecture:** Monolith with worker separation — shared TypeScript codebase, two entry points (web + worker), PostgreSQL + JSONB database, simple factory/registry plugin system. See `docs/architecture/architecture.md` and `docs/architecture/c4/` for diagrams.

**Tech Stack:** TypeScript, Node.js, React, PostgreSQL + JSONB, Drizzle ORM/Kit, Puppeteer, Express, Vite, Vitest, Pino, Docker Compose

**Spec:** `docs/superpowers/specs/2026-03-17-viralengine-core-pipeline-mvp-design.md`
**ADRs:** `docs/architecture/adrs.md`
**Wireframes:** `docs/ux/wireframes/r1/`

---

## File Structure

```
viral-pump/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── drizzle.config.ts
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── vitest.config.ts
├── db/
│   └── seed.sql
├── src/
│   ├── shared/
│   │   ├── config.ts                     # env var loading + validation
│   │   ├── db.ts                         # drizzle pg connection
│   │   ├── logger.ts                     # pino structured logger
│   │   └── schema/
│   │       ├── index.ts                  # re-exports all tables
│   │       ├── verticals.ts
│   │       ├── accounts.ts
│   │       ├── data-sources.ts
│   │       ├── trigger-rules.ts
│   │       ├── content-templates.ts
│   │       ├── content-items.ts
│   │       ├── posts.ts
│   │       └── job-queue.ts
│   ├── plugins/
│   │   ├── registry.ts                   # generic factory/registry helper
│   │   ├── data-sources/
│   │   │   ├── types.ts                  # DataSourceProvider interface + DetectedEvent
│   │   │   ├── coingecko.ts
│   │   │   └── exchangerate.ts
│   │   ├── content-generators/
│   │   │   ├── types.ts                  # ContentGenerator interface
│   │   │   ├── claude.ts
│   │   │   └── openai.ts
│   │   ├── visual-generators/
│   │   │   ├── types.ts                  # VisualGenerator interface
│   │   │   └── puppeteer-html.ts
│   │   ├── posting-strategies/
│   │   │   ├── types.ts                  # PostingStrategy interface
│   │   │   └── twitter-api.ts
│   │   ├── job-queue/
│   │   │   ├── types.ts                  # JobQueue interface
│   │   │   └── postgres-queue.ts
│   │   └── asset-store/
│   │       ├── types.ts                  # AssetStore interface
│   │       └── local-volume.ts
│   ├── domain/
│   │   ├── detected-event.ts             # DetectedEvent type + validation
│   │   ├── trigger-evaluator.ts          # rule matching + predicate evaluation
│   │   └── review-workflow.ts            # atomic approve/edit/reject + post creation
│   ├── worker/
│   │   ├── index.ts                      # worker entry point
│   │   ├── scheduler.ts                  # polls data sources on intervals
│   │   ├── event-detector.ts             # evaluates trigger rules against events
│   │   ├── handlers/
│   │   │   ├── generate-content.ts       # handles generate-content jobs
│   │   │   ├── generate-visual.ts        # handles generate-visual jobs
│   │   │   └── post-to-platform.ts       # handles post-to-platform jobs
│   │   └── job-reaper.ts                 # reclaims stale jobs
│   └── web/
│       ├── index.ts                      # web entry point
│       ├── api/
│       │   ├── router.ts                 # Express router setup
│       │   ├── content-items.ts          # GET /api/content-items, PATCH review actions
│       │   ├── posts.ts                  # GET /api/posts, PATCH mark-as-posted
│       │   └── verticals.ts             # GET /api/verticals, PATCH toggle
│       └── dashboard/
│           ├── index.html
│           ├── vite.config.ts
│           └── src/
│               ├── main.tsx
│               ├── App.tsx
│               ├── api.ts                # fetch helpers
│               ├── pages/
│               │   ├── ReviewQueue.tsx
│               │   ├── PostMonitor.tsx
│               │   └── VerticalManagement.tsx
│               └── components/
│                   ├── Layout.tsx
│                   ├── ContentCard.tsx
│                   └── EditModal.tsx
└── tests/
    ├── setup.ts                          # test DB setup/teardown
    ├── domain/
    │   ├── trigger-evaluator.test.ts
    │   └── review-workflow.test.ts
    ├── plugins/
    │   ├── registry.test.ts
    │   ├── postgres-queue.test.ts
    │   ├── coingecko.test.ts
    │   └── exchangerate.test.ts
    ├── worker/
    │   ├── scheduler.test.ts
    │   └── event-detector.test.ts
    └── web/
        └── api/
            ├── content-items.test.ts
            └── posts.test.ts
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `.env.example`, `vitest.config.ts`

- [ ] **Step 1: Initialize project and install dependencies**

```bash
cd /home/umut/projects/hobby/viral-pump
npm init -y
npm install typescript @types/node tsx --save-dev
npm install drizzle-orm drizzle-kit postgres
npm install express @types/express cors @types/cors
npm install pino pino-pretty
npm install zod dotenv
npm install vitest --save-dev
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "resolveJsonModule": true,
    "declaration": true,
    "paths": {
      "@shared/*": ["./src/shared/*"],
      "@plugins/*": ["./src/plugins/*"],
      "@domain/*": ["./src/domain/*"],
      "@worker/*": ["./src/worker/*"],
      "@web/*": ["./src/web/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create .env.example**

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/viralengine

# LLM
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
LLM_PROVIDER=claude
LLM_MODEL=claude-haiku-4-5-20251001

# Twitter/X API (OAuth 1.0a for posting)
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
TWITTER_ACCESS_TOKEN=...
TWITTER_ACCESS_TOKEN_SECRET=...

# Worker
WORKER_ID=worker-1
ASSET_DIR=./assets

# Web
PORT=3000
AUTH_SECRET=change-me-in-production
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './src/shared'),
      '@plugins': path.resolve(__dirname, './src/plugins'),
      '@domain': path.resolve(__dirname, './src/domain'),
      '@worker': path.resolve(__dirname, './src/worker'),
      '@web': path.resolve(__dirname, './src/web'),
    },
  },
});
```

- [ ] **Step 5: Create src/shared/config.ts**

```typescript
import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  LLM_PROVIDER: z.enum(['claude', 'openai']).default('claude'),
  LLM_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  TWITTER_API_KEY: z.string().optional(),
  TWITTER_API_SECRET: z.string().optional(),
  TWITTER_ACCESS_TOKEN: z.string().optional(),
  TWITTER_ACCESS_TOKEN_SECRET: z.string().optional(),
  WORKER_ID: z.string().default(`worker-${process.pid}`),
  ASSET_DIR: z.string().default('./assets'),
  PORT: z.coerce.number().default(3000),
  AUTH_SECRET: z.string().default('dev-secret'),
});

export const config = envSchema.parse(process.env);
export type Config = z.infer<typeof envSchema>;
```

- [ ] **Step 6: Create src/shared/logger.ts**

```typescript
import pino from 'pino';

export const logger = pino({
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
```

- [ ] **Step 7: Add scripts to package.json**

Add to `package.json` scripts:

```json
{
  "scripts": {
    "dev:web": "tsx watch src/web/index.ts",
    "dev:worker": "tsx watch src/worker/index.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "psql $DATABASE_URL -f db/seed.sql",
    "test": "vitest",
    "test:run": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json .env.example vitest.config.ts src/shared/config.ts src/shared/logger.ts
# Commit message: "feat: project scaffolding with TypeScript, Drizzle, Express, Vitest"
```

---

## Task 2: Database Schema (Drizzle)

**Files:**
- Create: `src/shared/schema/verticals.ts`, `src/shared/schema/accounts.ts`, `src/shared/schema/data-sources.ts`, `src/shared/schema/trigger-rules.ts`, `src/shared/schema/content-templates.ts`, `src/shared/schema/content-items.ts`, `src/shared/schema/posts.ts`, `src/shared/schema/job-queue.ts`, `src/shared/schema/index.ts`, `src/shared/db.ts`, `drizzle.config.ts`

- [ ] **Step 1: Create drizzle.config.ts**

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/shared/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 2: Create src/shared/db.ts**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';
import { config } from './config.js';

const client = postgres(config.DATABASE_URL);
export const db = drizzle(client, { schema });
export type DB = typeof db;
```

- [ ] **Step 3: Create src/shared/schema/verticals.ts**

```typescript
import { pgTable, uuid, text, integer, jsonb, timestamptz } from 'drizzle-orm/pg-core';

export const verticals = pgTable('verticals', {
  id: uuid('id').defaultRandom().primaryKey(),
  parentId: uuid('parent_id').references((): any => verticals.id),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  depth: integer('depth').notNull().default(0),
  config: jsonb('config').notNull().default({}),
  status: text('status').notNull().default('active'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});
```

- [ ] **Step 4: Create src/shared/schema/accounts.ts**

```typescript
import { pgTable, uuid, text, jsonb, timestamptz } from 'drizzle-orm/pg-core';
import { verticals } from './verticals.js';

export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  verticalId: uuid('vertical_id').notNull().references(() => verticals.id),
  platform: text('platform').notNull(),
  name: text('name').notNull(),
  language: text('language').notNull(),
  market: text('market').notNull().default('global'),
  credentials: jsonb('credentials').notNull().default({}),
  config: jsonb('config').notNull().default({}),
  status: text('status').notNull().default('active'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});
```

- [ ] **Step 5: Create src/shared/schema/data-sources.ts**

```typescript
import { pgTable, uuid, text, integer, jsonb, timestamptz } from 'drizzle-orm/pg-core';
import { verticals } from './verticals.js';

export const dataSources = pgTable('data_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  verticalId: uuid('vertical_id').notNull().references(() => verticals.id),
  provider: text('provider').notNull(),
  config: jsonb('config').notNull().default({}),
  pollIntervalMs: integer('poll_interval_ms').notNull().default(60000),
  status: text('status').notNull().default('active'),
  lastPolledAt: timestamptz('last_polled_at'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});
```

- [ ] **Step 6: Create src/shared/schema/trigger-rules.ts**

```typescript
import { pgTable, uuid, text, integer, jsonb, boolean, timestamptz } from 'drizzle-orm/pg-core';
import { verticals } from './verticals.js';

export const triggerRules = pgTable('trigger_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  verticalId: uuid('vertical_id').notNull().references(() => verticals.id),
  name: text('name').notNull(),
  condition: jsonb('condition').notNull(),
  fireMode: text('fire_mode').notNull().default('threshold_cross'),
  cooldownMs: integer('cooldown_ms').notNull().default(3600000),
  lookbackWindowMs: integer('lookback_window_ms').notNull().default(300000),
  contentConfig: jsonb('content_config').notNull().default({}),
  lastFiredAt: timestamptz('last_fired_at'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});
```

- [ ] **Step 7: Create src/shared/schema/content-templates.ts**

```typescript
import { pgTable, uuid, text, jsonb, boolean, timestamptz } from 'drizzle-orm/pg-core';
import { verticals } from './verticals.js';

export const contentTemplates = pgTable('content_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  verticalId: uuid('vertical_id').notNull().references(() => verticals.id),
  name: text('name').notNull(),
  category: text('category').notNull(),
  contentLayer: text('content_layer').notNull(),
  platform: text('platform'),
  promptTemplate: text('prompt_template').notNull(),
  visualTemplate: jsonb('visual_template').notNull().default({}),
  generationConfig: jsonb('generation_config').notNull().default({}),
  tags: jsonb('tags').notNull().default([]),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});
```

- [ ] **Step 8: Create src/shared/schema/content-items.ts**

```typescript
import { pgTable, uuid, text, jsonb, timestamptz, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { verticals } from './verticals.js';
import { contentTemplates } from './content-templates.js';

export const contentItems = pgTable('content_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  verticalId: uuid('vertical_id').notNull().references(() => verticals.id),
  templateId: uuid('template_id').references(() => contentTemplates.id),
  eventData: jsonb('event_data').notNull().default({}),
  generatedText: text('generated_text'),
  visualUrl: text('visual_url'),
  generationStatus: text('generation_status').notNull().default('generating'),
  reviewStatus: text('review_status').notNull().default('draft'),
  finalText: text('final_text'),
  reviewNotes: text('review_notes'),
  editedAt: timestamptz('edited_at'),
  aiConfig: jsonb('ai_config').notNull().default({}),
  cost: jsonb('cost').notNull().default({}),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  reviewedAt: timestamptz('reviewed_at'),
}, (table) => [
  index('idx_content_items_review').on(table.reviewStatus)
    .where(sql`${table.generationStatus} = 'ready' AND ${table.reviewStatus} = 'pending'`),
]);
```

- [ ] **Step 9: Create src/shared/schema/posts.ts**

```typescript
import { pgTable, uuid, text, jsonb, timestamptz, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { contentItems } from './content-items.js';
import { accounts } from './accounts.js';

export const posts = pgTable('posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  contentId: uuid('content_id').notNull().references(() => contentItems.id),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  status: text('status').notNull().default('ready'),
  postedAt: timestamptz('posted_at'),
  platformPostId: text('platform_post_id'),
  metrics: jsonb('metrics').notNull().default({}),
  cost: jsonb('cost').notNull().default({}),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
}, (table) => [
  unique('uq_posts_content_account').on(table.contentId, table.accountId),
  index('idx_posts_status').on(table.status).where(sql`${table.status} = 'ready'`),
]);
```

- [ ] **Step 10: Create src/shared/schema/job-queue.ts**

```typescript
import { pgTable, uuid, text, integer, jsonb, timestamptz, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const jobQueue = pgTable('job_queue', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull().default({}),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  lockedBy: text('locked_by'),
  lockedAt: timestamptz('locked_at'),
  leaseExpiresAt: timestamptz('lease_expires_at'),
  scheduledAt: timestamptz('scheduled_at').notNull().defaultNow(),
  startedAt: timestamptz('started_at'),
  completedAt: timestamptz('completed_at'),
  error: jsonb('error'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_job_queue_pending').on(table.scheduledAt).where(sql`${table.status} = 'pending'`),
  index('idx_job_queue_stale').on(table.leaseExpiresAt).where(sql`${table.status} = 'processing'`),
]);
```

- [ ] **Step 11: Create src/shared/schema/index.ts**

```typescript
export { verticals } from './verticals.js';
export { accounts } from './accounts.js';
export { dataSources } from './data-sources.js';
export { triggerRules } from './trigger-rules.js';
export { contentTemplates } from './content-templates.js';
export { contentItems } from './content-items.js';
export { posts } from './posts.js';
export { jobQueue } from './job-queue.js';
```

- [ ] **Step 12: Generate and run migration**

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

Verify: All 8 tables created in the database.

- [ ] **Step 13: Commit**

```bash
git add drizzle.config.ts src/shared/schema/ src/shared/db.ts drizzle/
# Commit message: "feat: database schema with Drizzle — 8 tables, JSONB, indexes"
```

---

## Task 3: Seed Data

**Files:**
- Create: `db/seed.sql`

- [ ] **Step 1: Write seed SQL**

```sql
-- db/seed.sql
-- Development seed data for Gold/Forex vertical
-- Run manually: psql $DATABASE_URL -f db/seed.sql

-- Clear existing seed data (idempotent)
DELETE FROM posts WHERE content_id IN (SELECT id FROM content_items WHERE vertical_id IN (SELECT id FROM verticals WHERE slug = 'gold-forex'));
DELETE FROM content_items WHERE vertical_id IN (SELECT id FROM verticals WHERE slug = 'gold-forex');
DELETE FROM job_queue WHERE payload->>'verticalSlug' = 'gold-forex';
DELETE FROM content_templates WHERE vertical_id IN (SELECT id FROM verticals WHERE slug = 'gold-forex');
DELETE FROM trigger_rules WHERE vertical_id IN (SELECT id FROM verticals WHERE slug = 'gold-forex');
DELETE FROM data_sources WHERE vertical_id IN (SELECT id FROM verticals WHERE slug = 'gold-forex');
DELETE FROM accounts WHERE vertical_id IN (SELECT id FROM verticals WHERE slug = 'gold-forex');
DELETE FROM verticals WHERE slug = 'gold-forex';

-- 1. Vertical
INSERT INTO verticals (id, name, slug, depth, config, status) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Gold & Forex',
  'gold-forex',
  0,
  '{
    "defaults": {
      "contentGenerator": { "provider": "claude", "model": "claude-haiku-4-5-20251001" },
      "visualGenerator": { "provider": "puppeteer-html" },
      "language": "en",
      "tone": "informative",
      "brandVoice": "data-driven, concise, no hype"
    }
  }'::jsonb,
  'active'
);

-- 2. Account
INSERT INTO accounts (id, vertical_id, platform, name, language, market, config, status) VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'twitter',
  'Gold Forex EN',
  'en',
  'global',
  '{ "postingStrategy": "twitter-api" }'::jsonb,
  'active'
);

-- 3. Data Sources
INSERT INTO data_sources (id, vertical_id, provider, config, poll_interval_ms, status) VALUES
(
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'coingecko',
  '{ "endpoint": "https://api.coingecko.com/api/v3/simple/price", "assets": { "gold": "XAU" }, "vsCurrencies": ["usd"] }'::jsonb,
  60000,
  'active'
),
(
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000001',
  'exchangerate',
  '{ "endpoint": "https://api.exchangerate.host/latest", "base": "USD", "symbols": ["TRY", "EUR"] }'::jsonb,
  300000,
  'active'
);

-- 4. Trigger Rules
INSERT INTO trigger_rules (id, vertical_id, name, condition, fire_mode, cooldown_ms, lookback_window_ms, enabled) VALUES
(
  '00000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000001',
  'Gold moves >1% in 5 min',
  '{ "match": { "source": "coingecko", "instrument": "XAU/USD" }, "predicate": { "field": "changePct", "operator": "gt", "value": 1.0 } }'::jsonb,
  'threshold_cross',
  3600000,
  300000,
  true
),
(
  '00000000-0000-0000-0000-000000000006',
  '00000000-0000-0000-0000-000000000001',
  'USD/TRY moves >0.5% in 5 min',
  '{ "match": { "source": "exchangerate", "instrument": "USD/TRY" }, "predicate": { "field": "changePct", "operator": "gt", "value": 0.5 } }'::jsonb,
  'threshold_cross',
  3600000,
  300000,
  true
);

-- 5. Content Templates
INSERT INTO content_templates (id, vertical_id, name, category, content_layer, platform, prompt_template, visual_template, generation_config, tags, enabled) VALUES
(
  '00000000-0000-0000-0000-000000000007',
  '00000000-0000-0000-0000-000000000001',
  'gold-price-alert',
  'real-time-event',
  'L1',
  NULL,
  'You are a concise financial content writer for social media. Write a tweet (max 270 chars, leave room for an image link) about this gold price movement.

Event data:
- Instrument: {{instrument}}
- Current price: ${{price}}
- Change: {{changePct}}% in the last {{lookbackMinutes}} minutes
- Direction: {{direction}}
- Previous price: ${{previousPrice}}

Requirements:
- Lead with the price and percentage change
- Add brief historical context if the move is significant
- Use a data-driven, no-hype tone
- Do NOT use hashtags or emojis
- Do NOT give financial advice',
  '{ "provider": "puppeteer-html", "template": "price-card", "config": { "width": 1200, "height": 628 } }'::jsonb,
  '{ "temperature": 0.7 }'::jsonb,
  '["urgent", "data-driven"]'::jsonb,
  true
),
(
  '00000000-0000-0000-0000-000000000008',
  '00000000-0000-0000-0000-000000000001',
  'forex-rate-alert',
  'real-time-event',
  'L1',
  NULL,
  'You are a concise financial content writer for social media. Write a tweet (max 270 chars) about this forex rate movement.

Event data:
- Pair: {{instrument}}
- Current rate: {{price}}
- Change: {{changePct}}% in the last {{lookbackMinutes}} minutes
- Direction: {{direction}}
- Previous rate: {{previousPrice}}

Requirements:
- Lead with the rate and percentage change
- Mention impact on Turkish market if USD/TRY or EUR/TRY
- Use a data-driven, no-hype tone
- Do NOT use hashtags or emojis
- Do NOT give financial advice',
  '{ "provider": "puppeteer-html", "template": "price-card", "config": { "width": 1200, "height": 628 } }'::jsonb,
  '{ "temperature": 0.7 }'::jsonb,
  '["urgent", "data-driven"]'::jsonb,
  true
);
```

- [ ] **Step 2: Run seed**

```bash
psql $DATABASE_URL -f db/seed.sql
```

Verify: `SELECT count(*) FROM verticals;` returns 1, `SELECT count(*) FROM content_templates;` returns 2.

- [ ] **Step 3: Commit**

```bash
git add db/seed.sql
# Commit message: "feat: seed data for Gold/Forex vertical"
```

---

## Task 4: Plugin System Foundation

**Files:**
- Create: `src/plugins/registry.ts`
- Test: `tests/plugins/registry.test.ts`

- [ ] **Step 1: Write failing test for registry**

```typescript
// tests/plugins/registry.test.ts
import { describe, it, expect } from 'vitest';
import { createRegistry } from '@plugins/registry.js';

interface Greeter {
  greet(name: string): string;
}

describe('Plugin Registry', () => {
  it('resolves a registered implementation by name', () => {
    const registry = createRegistry<Greeter>();
    registry.register('hello', (config) => ({
      greet: (name) => `Hello ${name}, ${config.suffix}`,
    }));

    const greeter = registry.resolve('hello', { suffix: 'welcome!' });
    expect(greeter.greet('Umut')).toBe('Hello Umut, welcome!');
  });

  it('throws for unknown implementation', () => {
    const registry = createRegistry<Greeter>();
    expect(() => registry.resolve('unknown', {})).toThrow('Unknown plugin: unknown');
  });

  it('lists registered names', () => {
    const registry = createRegistry<Greeter>();
    registry.register('a', () => ({ greet: () => '' }));
    registry.register('b', () => ({ greet: () => '' }));
    expect(registry.names()).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/plugins/registry.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement registry**

```typescript
// src/plugins/registry.ts
export interface PluginRegistry<T> {
  register(name: string, factory: (config: any) => T): void;
  resolve(name: string, config: any): T;
  names(): string[];
}

export function createRegistry<T>(): PluginRegistry<T> {
  const factories = new Map<string, (config: any) => T>();

  return {
    register(name, factory) {
      factories.set(name, factory);
    },
    resolve(name, config) {
      const factory = factories.get(name);
      if (!factory) throw new Error(`Unknown plugin: ${name}`);
      return factory(config);
    },
    names() {
      return [...factories.keys()];
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/plugins/registry.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/registry.ts tests/plugins/registry.test.ts
# Commit message: "feat: generic plugin registry with factory/registry pattern"
```

---

## Task 5: Job Queue Plugin

**Files:**
- Create: `src/plugins/job-queue/types.ts`, `src/plugins/job-queue/postgres-queue.ts`
- Test: `tests/plugins/postgres-queue.test.ts`

- [ ] **Step 1: Create job queue interface**

```typescript
// src/plugins/job-queue/types.ts
export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

export interface JobQueue {
  enqueue(type: string, payload: Record<string, unknown>, options?: {
    scheduledAt?: Date;
    maxAttempts?: number;
  }): Promise<string>;

  dequeue(workerId: string, leaseDurationMs: number): Promise<Job | null>;

  complete(jobId: string): Promise<void>;

  fail(jobId: string, error: unknown): Promise<void>;

  extendLease(jobId: string, leaseDurationMs: number): Promise<void>;
}
```

- [ ] **Step 2: Write failing test for postgres queue**

```typescript
// tests/plugins/postgres-queue.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { PostgresJobQueue } from '@plugins/job-queue/postgres-queue.js';
import { db } from '@shared/db.js';
import { jobQueue } from '@shared/schema/job-queue.js';
import { eq } from 'drizzle-orm';

describe('PostgresJobQueue', () => {
  let queue: PostgresJobQueue;

  beforeEach(async () => {
    queue = new PostgresJobQueue(db);
    await db.delete(jobQueue); // clear between tests
  });

  it('enqueues and dequeues a job', async () => {
    const id = await queue.enqueue('test-job', { foo: 'bar' });
    expect(id).toBeTruthy();

    const job = await queue.dequeue('worker-1', 60000);
    expect(job).not.toBeNull();
    expect(job!.type).toBe('test-job');
    expect(job!.payload).toEqual({ foo: 'bar' });
  });

  it('returns null when no jobs available', async () => {
    const job = await queue.dequeue('worker-1', 60000);
    expect(job).toBeNull();
  });

  it('does not dequeue a completed job', async () => {
    const id = await queue.enqueue('test-job', {});
    const job = await queue.dequeue('worker-1', 60000);
    await queue.complete(job!.id);

    const next = await queue.dequeue('worker-1', 60000);
    expect(next).toBeNull();
  });

  it('retries failed jobs with backoff', async () => {
    await queue.enqueue('test-job', {}, { maxAttempts: 3 });
    const job = await queue.dequeue('worker-1', 60000);
    await queue.fail(job!.id, new Error('boom'));

    // Job should be re-enqueued with scheduled_at in the future
    const [row] = await db.select().from(jobQueue).where(eq(jobQueue.id, job!.id));
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(1);
    expect(new Date(row.scheduledAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it('marks job as failed after max attempts', async () => {
    await queue.enqueue('test-job', {}, { maxAttempts: 1 });
    const job = await queue.dequeue('worker-1', 60000);
    await queue.fail(job!.id, new Error('boom'));

    const [row] = await db.select().from(jobQueue).where(eq(jobQueue.id, job!.id));
    expect(row.status).toBe('failed');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/plugins/postgres-queue.test.ts
```

- [ ] **Step 4: Implement PostgresJobQueue**

```typescript
// src/plugins/job-queue/postgres-queue.ts
import { eq, sql, and, lte } from 'drizzle-orm';
import { jobQueue } from '@shared/schema/job-queue.js';
import type { DB } from '@shared/db.js';
import type { Job, JobQueue } from './types.js';

export class PostgresJobQueue implements JobQueue {
  constructor(private db: DB) {}

  async enqueue(type: string, payload: Record<string, unknown>, options?: {
    scheduledAt?: Date;
    maxAttempts?: number;
  }): Promise<string> {
    const [row] = await this.db.insert(jobQueue).values({
      type,
      payload,
      scheduledAt: options?.scheduledAt ?? new Date(),
      maxAttempts: options?.maxAttempts ?? 3,
    }).returning({ id: jobQueue.id });
    return row.id;
  }

  async dequeue(workerId: string, leaseDurationMs: number): Promise<Job | null> {
    const now = new Date();
    const leaseExpires = new Date(now.getTime() + leaseDurationMs);

    // SELECT ... FOR UPDATE SKIP LOCKED
    const rows = await this.db.execute(sql`
      UPDATE ${jobQueue}
      SET status = 'processing',
          locked_by = ${workerId},
          locked_at = ${now},
          started_at = ${now},
          lease_expires_at = ${leaseExpires}
      WHERE id = (
        SELECT id FROM ${jobQueue}
        WHERE status = 'pending' AND scheduled_at <= ${now}
        ORDER BY scheduled_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, type, payload, attempts, max_attempts
    `);

    if (!rows.length) return null;

    const row = rows[0] as any;
    return {
      id: row.id,
      type: row.type,
      payload: row.payload,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
    };
  }

  async complete(jobId: string): Promise<void> {
    await this.db.update(jobQueue)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(jobQueue.id, jobId));
  }

  async fail(jobId: string, error: unknown): Promise<void> {
    const errorJson = error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { message: String(error) };

    await this.db.execute(sql`
      UPDATE ${jobQueue}
      SET attempts = attempts + 1,
          status = CASE WHEN (attempts + 1) >= max_attempts THEN 'failed' ELSE 'pending' END,
          scheduled_at = CASE WHEN (attempts + 1) >= max_attempts THEN scheduled_at
            ELSE now() + ((attempts + 1) * interval '30 seconds') END,
          locked_by = NULL,
          locked_at = NULL,
          lease_expires_at = NULL,
          error = ${JSON.stringify(errorJson)}::jsonb
      WHERE id = ${jobId}
    `);
  }

  async extendLease(jobId: string, leaseDurationMs: number): Promise<void> {
    const leaseExpires = new Date(Date.now() + leaseDurationMs);
    await this.db.update(jobQueue)
      .set({ leaseExpiresAt: leaseExpires })
      .where(eq(jobQueue.id, jobId));
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/plugins/postgres-queue.test.ts
```

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/plugins/job-queue/ tests/plugins/postgres-queue.test.ts
# Commit message: "feat: Postgres job queue with FOR UPDATE SKIP LOCKED and lease-based expiry"
```

---

## Task 6: Domain — DetectedEvent and Trigger Evaluator

**Files:**
- Create: `src/domain/detected-event.ts`, `src/domain/trigger-evaluator.ts`
- Test: `tests/domain/trigger-evaluator.test.ts`

- [ ] **Step 1: Create DetectedEvent type**

```typescript
// src/domain/detected-event.ts
import { z } from 'zod';

export const DetectedEventSchema = z.object({
  source: z.string(),
  instrument: z.string(),
  baseCurrency: z.string(),
  quoteCurrency: z.string(),
  price: z.number(),
  previousPrice: z.number(),
  changePct: z.number(),
  observedAt: z.date(),
  rawPayload: z.record(z.unknown()),
});

export type DetectedEvent = z.infer<typeof DetectedEventSchema>;
```

- [ ] **Step 2: Write failing tests for trigger evaluator**

```typescript
// tests/domain/trigger-evaluator.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateRule, matchesEvent } from '@domain/trigger-evaluator.js';
import type { DetectedEvent } from '@domain/detected-event.js';

const goldEvent: DetectedEvent = {
  source: 'coingecko',
  instrument: 'XAU/USD',
  baseCurrency: 'XAU',
  quoteCurrency: 'USD',
  price: 2350,
  previousPrice: 2320,
  changePct: 1.29,
  observedAt: new Date(),
  rawPayload: {},
};

describe('matchesEvent', () => {
  it('matches when all match fields align', () => {
    const condition = { match: { source: 'coingecko', instrument: 'XAU/USD' }, predicate: { field: 'changePct', operator: 'gt', value: 1.0 } };
    expect(matchesEvent(condition, goldEvent)).toBe(true);
  });

  it('does not match different source', () => {
    const condition = { match: { source: 'exchangerate' }, predicate: { field: 'changePct', operator: 'gt', value: 1.0 } };
    expect(matchesEvent(condition, goldEvent)).toBe(false);
  });

  it('matches when match is empty (match any)', () => {
    const condition = { match: {}, predicate: { field: 'changePct', operator: 'gt', value: 1.0 } };
    expect(matchesEvent(condition, goldEvent)).toBe(true);
  });
});

describe('evaluateRule', () => {
  it('fires when predicate is satisfied and cooldown expired', () => {
    const rule = {
      condition: { match: { source: 'coingecko' }, predicate: { field: 'changePct', operator: 'gt', value: 1.0 } },
      fireMode: 'threshold_cross' as const,
      cooldownMs: 3600000,
      lastFiredAt: null,
    };
    expect(evaluateRule(rule, goldEvent)).toBe(true);
  });

  it('does not fire when within cooldown', () => {
    const rule = {
      condition: { match: { source: 'coingecko' }, predicate: { field: 'changePct', operator: 'gt', value: 1.0 } },
      fireMode: 'threshold_cross' as const,
      cooldownMs: 3600000,
      lastFiredAt: new Date(), // just fired
    };
    expect(evaluateRule(rule, goldEvent)).toBe(false);
  });

  it('does not fire when predicate not met', () => {
    const rule = {
      condition: { match: {}, predicate: { field: 'changePct', operator: 'gt', value: 5.0 } },
      fireMode: 'threshold_cross' as const,
      cooldownMs: 0,
      lastFiredAt: null,
    };
    expect(evaluateRule(rule, goldEvent)).toBe(false);
  });

  it('supports lt operator', () => {
    const rule = {
      condition: { match: {}, predicate: { field: 'price', operator: 'lt', value: 3000 } },
      fireMode: 'threshold_cross' as const,
      cooldownMs: 0,
      lastFiredAt: null,
    };
    expect(evaluateRule(rule, goldEvent)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify failure**

```bash
npx vitest run tests/domain/trigger-evaluator.test.ts
```

- [ ] **Step 4: Implement trigger evaluator**

```typescript
// src/domain/trigger-evaluator.ts
import type { DetectedEvent } from './detected-event.js';

interface Condition {
  match: Record<string, string>;
  predicate: { field: string; operator: string; value: number };
}

interface RuleInput {
  condition: Condition;
  fireMode: 'threshold_cross' | 'stateful_true' | 'every_poll';
  cooldownMs: number;
  lastFiredAt: Date | null;
}

export function matchesEvent(condition: Condition, event: DetectedEvent): boolean {
  const { match } = condition;
  for (const [key, value] of Object.entries(match)) {
    if ((event as any)[key] !== value) return false;
  }
  return true;
}

function evaluatePredicate(predicate: Condition['predicate'], event: DetectedEvent): boolean {
  const actual = (event as any)[predicate.field];
  if (typeof actual !== 'number') return false;

  switch (predicate.operator) {
    case 'gt': return actual > predicate.value;
    case 'gte': return actual >= predicate.value;
    case 'lt': return actual < predicate.value;
    case 'lte': return actual <= predicate.value;
    case 'eq': return actual === predicate.value;
    default: return false;
  }
}

function isCooldownExpired(lastFiredAt: Date | null, cooldownMs: number): boolean {
  if (!lastFiredAt) return true;
  return Date.now() - lastFiredAt.getTime() >= cooldownMs;
}

export function evaluateRule(rule: RuleInput, event: DetectedEvent): boolean {
  if (!matchesEvent(rule.condition, event)) return false;
  if (!isCooldownExpired(rule.lastFiredAt, rule.cooldownMs)) return false;
  if (!evaluatePredicate(rule.condition.predicate, event)) return false;
  return true;
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/domain/trigger-evaluator.test.ts
```

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/domain/ tests/domain/trigger-evaluator.test.ts
# Commit message: "feat: DetectedEvent model and trigger rule evaluator with cooldown"
```

---

## Task 7: Data Source Providers

**Files:**
- Create: `src/plugins/data-sources/types.ts`, `src/plugins/data-sources/coingecko.ts`, `src/plugins/data-sources/exchangerate.ts`
- Test: `tests/plugins/coingecko.test.ts`, `tests/plugins/exchangerate.test.ts`

- [ ] **Step 1: Create DataSourceProvider interface**

```typescript
// src/plugins/data-sources/types.ts
import type { DetectedEvent } from '@domain/detected-event.js';

export interface DataSourceProvider {
  poll(): Promise<DetectedEvent[]>;
}
```

- [ ] **Step 2: Write test for CoinGecko provider (with mocked fetch)**

```typescript
// tests/plugins/coingecko.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoinGeckoProvider } from '@plugins/data-sources/coingecko.js';

describe('CoinGeckoProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns DetectedEvent for gold price', async () => {
    const mockResponse = { gold: { usd: 2350 } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    const provider = new CoinGeckoProvider({
      endpoint: 'https://api.coingecko.com/api/v3/simple/price',
      assets: { gold: 'XAU' },
      vsCurrencies: ['usd'],
    });

    // Seed previous price for change calculation
    provider.setPreviousPrice('XAU/USD', 2320);

    const events = await provider.poll();
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('coingecko');
    expect(events[0].instrument).toBe('XAU/USD');
    expect(events[0].price).toBe(2350);
    expect(events[0].previousPrice).toBe(2320);
    expect(events[0].changePct).toBeCloseTo(1.29, 1);
  });

  it('returns empty array on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network'));
    const provider = new CoinGeckoProvider({
      endpoint: 'https://api.coingecko.com/api/v3/simple/price',
      assets: { gold: 'XAU' },
      vsCurrencies: ['usd'],
    });

    const events = await provider.poll();
    expect(events).toEqual([]);
  });
});
```

- [ ] **Step 3: Implement CoinGecko provider**

```typescript
// src/plugins/data-sources/coingecko.ts
import type { DetectedEvent } from '@domain/detected-event.js';
import type { DataSourceProvider } from './types.js';
import { logger } from '@shared/logger.js';

interface CoinGeckoConfig {
  endpoint: string;
  assets: Record<string, string>; // { "gold": "XAU" }
  vsCurrencies: string[];
}

export class CoinGeckoProvider implements DataSourceProvider {
  private previousPrices = new Map<string, number>();
  private config: CoinGeckoConfig;

  constructor(config: CoinGeckoConfig) {
    this.config = config;
  }

  setPreviousPrice(instrument: string, price: number) {
    this.previousPrices.set(instrument, price);
  }

  async poll(): Promise<DetectedEvent[]> {
    try {
      const ids = Object.keys(this.config.assets).join(',');
      const vs = this.config.vsCurrencies.join(',');
      const url = `${this.config.endpoint}?ids=${ids}&vs_currencies=${vs}`;
      const res = await fetch(url);

      if (!res.ok) {
        logger.warn({ status: res.status }, 'CoinGecko API error');
        return [];
      }

      const data = await res.json();
      const events: DetectedEvent[] = [];
      const now = new Date();

      for (const [assetId, symbol] of Object.entries(this.config.assets)) {
        for (const vs of this.config.vsCurrencies) {
          const price = data?.[assetId]?.[vs];
          if (typeof price !== 'number') continue;

          const instrument = `${symbol}/${vs.toUpperCase()}`;
          const previousPrice = this.previousPrices.get(instrument) ?? price;
          const changePct = previousPrice !== 0
            ? ((price - previousPrice) / previousPrice) * 100
            : 0;

          events.push({
            source: 'coingecko',
            instrument,
            baseCurrency: symbol,
            quoteCurrency: vs.toUpperCase(),
            price,
            previousPrice,
            changePct,
            observedAt: now,
            rawPayload: data,
          });

          this.previousPrices.set(instrument, price);
        }
      }

      return events;
    } catch (err) {
      logger.error({ err }, 'CoinGecko poll failed');
      return [];
    }
  }
}
```

- [ ] **Step 4: Implement exchangerate.host provider** (similar pattern)

```typescript
// src/plugins/data-sources/exchangerate.ts
import type { DetectedEvent } from '@domain/detected-event.js';
import type { DataSourceProvider } from './types.js';
import { logger } from '@shared/logger.js';

interface ExchangeRateConfig {
  endpoint: string;
  base: string;
  symbols: string[];
}

export class ExchangeRateProvider implements DataSourceProvider {
  private previousRates = new Map<string, number>();
  private config: ExchangeRateConfig;

  constructor(config: ExchangeRateConfig) {
    this.config = config;
  }

  setPreviousRate(instrument: string, rate: number) {
    this.previousRates.set(instrument, rate);
  }

  async poll(): Promise<DetectedEvent[]> {
    try {
      const url = `${this.config.endpoint}?base=${this.config.base}&symbols=${this.config.symbols.join(',')}`;
      const res = await fetch(url);

      if (!res.ok) {
        logger.warn({ status: res.status }, 'exchangerate.host API error');
        return [];
      }

      const data = await res.json();
      const rates = data?.rates;
      if (!rates || typeof rates !== 'object') return [];

      const events: DetectedEvent[] = [];
      const now = new Date();

      for (const symbol of this.config.symbols) {
        const rate = rates[symbol];
        if (typeof rate !== 'number') continue;

        const instrument = `${this.config.base}/${symbol}`;
        const previousRate = this.previousRates.get(instrument) ?? rate;
        const changePct = previousRate !== 0
          ? ((rate - previousRate) / previousRate) * 100
          : 0;

        events.push({
          source: 'exchangerate',
          instrument,
          baseCurrency: this.config.base,
          quoteCurrency: symbol,
          price: rate,
          previousPrice: previousRate,
          changePct,
          observedAt: now,
          rawPayload: data,
        });

        this.previousRates.set(instrument, rate);
      }

      return events;
    } catch (err) {
      logger.error({ err }, 'exchangerate.host poll failed');
      return [];
    }
  }
}
```

- [ ] **Step 5: Write exchangerate test, run all provider tests**

```bash
npx vitest run tests/plugins/coingecko.test.ts tests/plugins/exchangerate.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/plugins/data-sources/ tests/plugins/coingecko.test.ts tests/plugins/exchangerate.test.ts
# Commit message: "feat: CoinGecko and exchangerate.host data source providers"
```

---

## Task 8: Content Generator Plugin

**Files:**
- Create: `src/plugins/content-generators/types.ts`, `src/plugins/content-generators/claude.ts`, `src/plugins/content-generators/openai.ts`
- Test: `tests/plugins/content-generators.test.ts`

- [ ] **Step 1: Install LLM SDKs**

```bash
npm install @anthropic-ai/sdk openai
```

- [ ] **Step 2: Create ContentGenerator interface**

```typescript
// src/plugins/content-generators/types.ts
import type { DetectedEvent } from '@domain/detected-event.js';

export interface ContentGeneratorInput {
  event: DetectedEvent;
  promptTemplate: string;
  generationConfig: Record<string, unknown>;
}

export interface ContentGeneratorOutput {
  text: string;
  tokensUsed: number;
  model: string;
  durationMs: number;
}

export interface ContentGenerator {
  generate(input: ContentGeneratorInput): Promise<ContentGeneratorOutput>;
}
```

- [ ] **Step 3: Implement Claude content generator**

```typescript
// src/plugins/content-generators/claude.ts
import Anthropic from '@anthropic-ai/sdk';
import type { ContentGenerator, ContentGeneratorInput, ContentGeneratorOutput } from './types.js';
import { logger } from '@shared/logger.js';

interface ClaudeConfig {
  apiKey: string;
  model: string;
}

export class ClaudeContentGenerator implements ContentGenerator {
  private client: Anthropic;
  private model: string;

  constructor(config: ClaudeConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model;
  }

  async generate(input: ContentGeneratorInput): Promise<ContentGeneratorOutput> {
    const start = Date.now();
    const prompt = this.fillTemplate(input.promptTemplate, input.event);
    const temperature = (input.generationConfig?.temperature as number) ?? 0.7;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return {
      text,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      model: this.model,
      durationMs: Date.now() - start,
    };
  }

  private fillTemplate(template: string, event: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      if (key === 'lookbackMinutes') return '5';
      if (key === 'direction') {
        return (event.changePct as number) >= 0 ? 'up' : 'down';
      }
      return String(event[key] ?? '');
    });
  }
}
```

- [ ] **Step 4: Implement OpenAI content generator** (same interface, different SDK)

```typescript
// src/plugins/content-generators/openai.ts
import OpenAI from 'openai';
import type { ContentGenerator, ContentGeneratorInput, ContentGeneratorOutput } from './types.js';

interface OpenAIConfig {
  apiKey: string;
  model: string;
}

export class OpenAIContentGenerator implements ContentGenerator {
  private client: OpenAI;
  private model: string;

  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model;
  }

  async generate(input: ContentGeneratorInput): Promise<ContentGeneratorOutput> {
    const start = Date.now();
    const prompt = this.fillTemplate(input.promptTemplate, input.event);
    const temperature = (input.generationConfig?.temperature as number) ?? 0.7;

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 512,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    });

    return {
      text: response.choices[0]?.message?.content ?? '',
      tokensUsed: response.usage?.total_tokens ?? 0,
      model: this.model,
      durationMs: Date.now() - start,
    };
  }

  private fillTemplate(template: string, event: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      if (key === 'lookbackMinutes') return '5';
      if (key === 'direction') {
        return (event.changePct as number) >= 0 ? 'up' : 'down';
      }
      return String(event[key] ?? '');
    });
  }
}
```

- [ ] **Step 5: Write test with mocked LLM, run tests**

Write a test that mocks the Anthropic SDK and verifies the template filling and output shape. Run tests.

- [ ] **Step 6: Commit**

```bash
git add src/plugins/content-generators/ tests/plugins/content-generators.test.ts
# Commit message: "feat: Claude and OpenAI content generator plugins"
```

---

## Task 9: Visual Generator Plugin

**Files:**
- Create: `src/plugins/visual-generators/types.ts`, `src/plugins/visual-generators/puppeteer-html.ts`, `src/plugins/asset-store/types.ts`, `src/plugins/asset-store/local-volume.ts`
- Test: `tests/plugins/visual-generators.test.ts`

- [ ] **Step 1: Install Puppeteer**

```bash
npm install puppeteer
```

- [ ] **Step 2: Create interfaces**

```typescript
// src/plugins/visual-generators/types.ts
export interface VisualGeneratorInput {
  contentItemId: string;
  generatedText: string;
  eventData: Record<string, unknown>;
  templateConfig: Record<string, unknown>;
}

export interface VisualGenerator {
  generate(input: VisualGeneratorInput): Promise<Buffer>;
}
```

```typescript
// src/plugins/asset-store/types.ts
export interface AssetStore {
  store(id: string, buffer: Buffer, extension: string): Promise<string>; // returns URL/path
  resolve(url: string): string; // returns absolute path for serving
}
```

- [ ] **Step 3: Implement local volume asset store**

```typescript
// src/plugins/asset-store/local-volume.ts
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import type { AssetStore } from './types.js';

export class LocalVolumeAssetStore implements AssetStore {
  constructor(private baseDir: string) {}

  async store(id: string, buffer: Buffer, extension: string): Promise<string> {
    await mkdir(this.baseDir, { recursive: true });
    const filename = `${id}.${extension}`;
    const filepath = path.join(this.baseDir, filename);
    await writeFile(filepath, buffer);
    return `/assets/${filename}`;
  }

  resolve(url: string): string {
    const filename = url.replace('/assets/', '');
    return path.join(this.baseDir, filename);
  }
}
```

- [ ] **Step 4: Implement Puppeteer HTML visual generator**

```typescript
// src/plugins/visual-generators/puppeteer-html.ts
import puppeteer from 'puppeteer';
import type { VisualGenerator, VisualGeneratorInput } from './types.js';
import { logger } from '@shared/logger.js';

export class PuppeteerHtmlVisualGenerator implements VisualGenerator {
  async generate(input: VisualGeneratorInput): Promise<Buffer> {
    const { generatedText, eventData, templateConfig } = input;
    const width = (templateConfig?.width as number) ?? 1200;
    const height = (templateConfig?.height as number) ?? 628;

    const html = this.renderPriceCard(generatedText, eventData, width, height);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const buffer = await page.screenshot({ type: 'png' }) as Buffer;
      return buffer;
    } finally {
      await browser.close();
    }
  }

  private renderPriceCard(
    text: string,
    eventData: Record<string, unknown>,
    width: number,
    height: number,
  ): string {
    const instrument = eventData.instrument ?? '';
    const price = eventData.price ?? '';
    const changePct = eventData.changePct as number ?? 0;
    const direction = changePct >= 0 ? 'up' : 'down';
    const color = changePct >= 0 ? '#22c55e' : '#ef4444';
    const arrow = changePct >= 0 ? '▲' : '▼';

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${width}px; height: ${height}px;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #f1f5f9; display: flex; flex-direction: column;
    justify-content: center; padding: 48px 64px;
  }
  .instrument { font-size: 24px; color: #94a3b8; margin-bottom: 12px; }
  .price-row { display: flex; align-items: baseline; gap: 16px; margin-bottom: 24px; }
  .price { font-size: 56px; font-weight: 700; }
  .change { font-size: 28px; font-weight: 600; color: ${color}; }
  .text { font-size: 22px; line-height: 1.5; color: #cbd5e1; max-width: 90%; }
  .footer { margin-top: auto; font-size: 14px; color: #475569; }
</style></head>
<body>
  <div class="instrument">${instrument}</div>
  <div class="price-row">
    <span class="price">$${price}</span>
    <span class="change">${arrow} ${Math.abs(changePct).toFixed(2)}%</span>
  </div>
  <div class="text">${text}</div>
  <div class="footer">ViralEngine · ${new Date().toLocaleDateString()}</div>
</body>
</html>`;
  }
}
```

- [ ] **Step 5: Write test (generates a real PNG), run it**

```bash
npx vitest run tests/plugins/visual-generators.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/plugins/visual-generators/ src/plugins/asset-store/ tests/plugins/visual-generators.test.ts
# Commit message: "feat: Puppeteer HTML visual generator + local volume asset store"
```

---

## Task 10: Domain — Review Workflow

**Files:**
- Create: `src/domain/review-workflow.ts`
- Test: `tests/domain/review-workflow.test.ts`

- [ ] **Step 1: Write failing tests**

Tests for atomic approve (creates post row), edit+approve (stores final_text), reject, and idempotent approve (second approve is no-op).

- [ ] **Step 2: Implement review workflow**

```typescript
// src/domain/review-workflow.ts
import { eq, and, sql } from 'drizzle-orm';
import { contentItems } from '@shared/schema/content-items.js';
import { posts } from '@shared/schema/posts.js';
import { accounts } from '@shared/schema/accounts.js';
import type { DB } from '@shared/db.js';
import type { JobQueue } from '@plugins/job-queue/types.js';

export async function approveContent(db: DB, jobQueue: JobQueue, contentItemId: string): Promise<boolean> {
  // Atomic: only transitions pending → approved
  const result = await db.update(contentItems)
    .set({ reviewStatus: 'approved', reviewedAt: new Date() })
    .where(and(
      eq(contentItems.id, contentItemId),
      eq(contentItems.reviewStatus, 'pending'),
    ))
    .returning({ id: contentItems.id, verticalId: contentItems.verticalId });

  if (result.length === 0) return false; // already approved or not pending

  // Create post rows for each active account and enqueue posting jobs
  const activeAccounts = await db.select()
    .from(accounts)
    .where(and(
      eq(accounts.verticalId, result[0].verticalId),
      eq(accounts.status, 'active'),
    ));

  for (const account of activeAccounts) {
    const [post] = await db.insert(posts)
      .values({ contentId: contentItemId, accountId: account.id })
      .onConflictDoNothing()
      .returning({ id: posts.id });

    if (post) {
      await jobQueue.enqueue('post-to-platform', {
        postId: post.id,
        contentItemId,
        accountId: account.id,
      });
    }
  }

  return true;
}

export async function editAndApprove(
  db: DB,
  jobQueue: JobQueue,
  contentItemId: string,
  finalText: string,
): Promise<boolean> {
  const result = await db.update(contentItems)
    .set({
      finalText,
      editedAt: new Date(),
      reviewStatus: 'approved',
      reviewedAt: new Date(),
    })
    .where(and(
      eq(contentItems.id, contentItemId),
      eq(contentItems.reviewStatus, 'pending'),
    ))
    .returning({ id: contentItems.id, verticalId: contentItems.verticalId });

  if (result.length === 0) return false;

  const activeAccounts = await db.select()
    .from(accounts)
    .where(and(
      eq(accounts.verticalId, result[0].verticalId),
      eq(accounts.status, 'active'),
    ));

  for (const account of activeAccounts) {
    const [post] = await db.insert(posts)
      .values({ contentId: contentItemId, accountId: account.id })
      .onConflictDoNothing()
      .returning({ id: posts.id });

    if (post) {
      await jobQueue.enqueue('post-to-platform', {
        postId: post.id,
        contentItemId,
        accountId: account.id,
      });
    }
  }

  return true;
}

export async function rejectContent(
  db: DB,
  contentItemId: string,
  notes?: string,
): Promise<boolean> {
  const result = await db.update(contentItems)
    .set({
      reviewStatus: 'rejected',
      reviewNotes: notes ?? null,
      reviewedAt: new Date(),
    })
    .where(and(
      eq(contentItems.id, contentItemId),
      eq(contentItems.reviewStatus, 'pending'),
    ))
    .returning({ id: contentItems.id });

  return result.length > 0;
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/domain/review-workflow.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/domain/review-workflow.ts tests/domain/review-workflow.test.ts
# Commit message: "feat: atomic review workflow — approve/edit/reject with post creation"
```

---

## Task 11: Worker — Scheduler, Event Detector, Job Handlers

**Files:**
- Create: `src/worker/scheduler.ts`, `src/worker/event-detector.ts`, `src/worker/handlers/generate-content.ts`, `src/worker/handlers/generate-visual.ts`, `src/worker/job-reaper.ts`, `src/worker/index.ts`

- [ ] **Step 1: Implement scheduler** — polls data_sources table, creates poll jobs at intervals

- [ ] **Step 2: Implement event-detector** — dequeues poll results, evaluates trigger rules, enqueues content generation jobs

- [ ] **Step 3: Implement generate-content handler** — creates content_item, calls ContentGenerator, enqueues visual generation

- [ ] **Step 4: Implement generate-visual handler** — calls VisualGenerator, stores asset, updates content_item to ready/pending

- [ ] **Step 5: Implement post-to-platform handler** — resolves PostingStrategy from account config, posts text + image via Twitter API, updates post status and platform_post_id. On failure, job retries per max_attempts.

- [ ] **Step 6: Implement job reaper** — periodic scan for stale leases

- [ ] **Step 7: Implement worker entry point** — wires all plugins, starts scheduler loop and job processing loop. Registers handlers for: poll-data-source, generate-content, generate-visual, post-to-platform.

- [ ] **Step 8: Write tests for scheduler and event-detector**

```bash
npx vitest run tests/worker/
```

- [ ] **Step 9: Commit**

```bash
git add src/worker/ tests/worker/
# Commit message: "feat: worker process — scheduler, event detector, content/visual gen, platform posting, job reaper"
```

---

## Task 12: Web — API Server

**Files:**
- Create: `src/web/index.ts`, `src/web/api/router.ts`, `src/web/api/content-items.ts`, `src/web/api/posts.ts`, `src/web/api/verticals.ts`
- Test: `tests/web/api/content-items.test.ts`, `tests/web/api/posts.test.ts`

- [ ] **Step 1: Create Express app with middleware**

```typescript
// src/web/index.ts
import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from '@shared/config.js';
import { logger } from '@shared/logger.js';
import { apiRouter } from './api/router.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/assets', express.static(config.ASSET_DIR));
app.use('/api', apiRouter);

app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'Web server started');
});
```

- [ ] **Step 2: Implement content-items API**

Endpoints:
- `GET /api/content-items?status=pending` — review queue
- `POST /api/content-items/:id/approve` — atomic approve
- `POST /api/content-items/:id/edit-approve` — edit + approve (body: `{ finalText }`)
- `POST /api/content-items/:id/reject` — reject (body: `{ notes? }`)

- [ ] **Step 3: Implement posts API**

Endpoints:
- `GET /api/posts?status=pending` — queued posts awaiting worker
- `GET /api/posts?status=posted` — successfully posted history
- `GET /api/posts?status=failed` — failed posts with error details
- `POST /api/posts/:id/retry` — re-enqueue a failed post for retry

- [ ] **Step 4: Implement verticals API**

Endpoints:
- `GET /api/verticals` — list with data sources, rules, templates, accounts
- `PATCH /api/verticals/:id/toggle` — enable/disable
- `PATCH /api/trigger-rules/:id/toggle` — enable/disable rule

- [ ] **Step 5: Write API tests, run them**

```bash
npx vitest run tests/web/api/
```

- [ ] **Step 6: Commit**

```bash
git add src/web/ tests/web/
# Commit message: "feat: REST API — content review, post management, vertical admin"
```

---

## Task 13: Dashboard — React App Setup + Review Queue

**Files:**
- Create: `src/web/dashboard/` (Vite React app)

- [ ] **Step 1: Scaffold React app with Vite**

```bash
cd src/web
npm create vite@latest dashboard -- --template react-ts
cd dashboard && npm install
npm install react-router-dom
```

- [ ] **Step 2: Configure Vite proxy to API**

```typescript
// src/web/dashboard/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/assets': 'http://localhost:3000',
    },
  },
});
```

- [ ] **Step 3: Implement Layout component** — nav bar with Review Queue / Posts / Verticals links. Mobile-responsive with hamburger menu. See `docs/ux/wireframes/r1/`.

- [ ] **Step 4: Implement ReviewQueue page** — fetches `GET /api/content-items?status=pending`, renders ContentCard list with Approve/Edit/Reject buttons. See `docs/ux/wireframes/r1/01-review-queue.md`.

- [ ] **Step 5: Implement EditModal component** — shows original text (read-only) + editable textarea with character count. Save & Approve calls edit-approve API.

- [ ] **Step 6: Implement api.ts fetch helpers**

```typescript
// src/web/dashboard/src/api.ts
const BASE = '';

// Review Queue
export async function fetchPendingContent() {
  const res = await fetch(`${BASE}/api/content-items?status=pending`);
  return res.json();
}

export async function approveContent(id: string) {
  return fetch(`${BASE}/api/content-items/${id}/approve`, { method: 'POST' });
}

export async function editAndApprove(id: string, finalText: string) {
  return fetch(`${BASE}/api/content-items/${id}/edit-approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ finalText }),
  });
}

export async function rejectContent(id: string, notes?: string) {
  return fetch(`${BASE}/api/content-items/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
}

// Post Monitor
export async function fetchPosts(status?: string) {
  const qs = status ? `?status=${status}` : '';
  const res = await fetch(`${BASE}/api/posts${qs}`);
  return res.json();
}

export async function retryPost(id: string) {
  return fetch(`${BASE}/api/posts/${id}/retry`, { method: 'POST' });
}
```

- [ ] **Step 7: Verify review queue works end-to-end in browser**

- [ ] **Step 8: Commit**

```bash
git add src/web/dashboard/
# Commit message: "feat: React dashboard — review queue with approve/edit/reject"
```

---

## Task 14: Twitter/X API Posting Plugin

**Files:**
- Create: `src/plugins/posting-strategies/types.ts`, `src/plugins/posting-strategies/twitter-api.ts`
- Test: `tests/plugins/twitter-api.test.ts`

- [ ] **Step 1: Install Twitter API client**

```bash
npm install twitter-api-v2
```

- [ ] **Step 2: Create PostingStrategy interface**

```typescript
// src/plugins/posting-strategies/types.ts
export interface PostInput {
  text: string;
  imagePath?: string;
}

export interface PostResult {
  platformPostId: string;
  postedAt: Date;
}

export interface PostingStrategy {
  post(input: PostInput): Promise<PostResult>;
}
```

- [ ] **Step 3: Write test with mocked Twitter client**

Test that the strategy calls `v1.uploadMedia` for images and `v2.tweet` with correct payload.

- [ ] **Step 4: Implement TwitterApiPostingStrategy**

```typescript
// src/plugins/posting-strategies/twitter-api.ts
import { TwitterApi } from 'twitter-api-v2';
import type { PostingStrategy, PostInput, PostResult } from './types.js';
import { logger } from '@shared/logger.js';

interface TwitterApiConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

export class TwitterApiPostingStrategy implements PostingStrategy {
  private client: TwitterApi;

  constructor(config: TwitterApiConfig) {
    this.client = new TwitterApi({
      appKey: config.apiKey,
      appSecret: config.apiSecret,
      accessToken: config.accessToken,
      accessSecret: config.accessTokenSecret,
    });
  }

  async post(input: PostInput): Promise<PostResult> {
    let mediaId: string | undefined;
    if (input.imagePath) {
      mediaId = await this.client.v1.uploadMedia(input.imagePath);
    }

    const tweetPayload: any = { text: input.text };
    if (mediaId) {
      tweetPayload.media = { media_ids: [mediaId] };
    }

    const result = await this.client.v2.tweet(tweetPayload);
    logger.info({ tweetId: result.data.id }, 'Tweet posted successfully');

    return {
      platformPostId: result.data.id,
      postedAt: new Date(),
    };
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/plugins/twitter-api.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/plugins/posting-strategies/ tests/plugins/twitter-api.test.ts
# Commit message: "feat: Twitter/X API posting strategy plugin"
```

---

## Task 15: Dashboard — Post Monitor Page

**Files:**
- Modify: `src/web/dashboard/src/pages/PostMonitor.tsx`, `src/web/dashboard/src/api.ts`

- [ ] **Step 1: Implement PostMonitor page** — tabs for Pending/Posted/Failed. Shows automated posting status. See `docs/ux/wireframes/r1/02-post-monitor.md`.

- [ ] **Step 2: Implement Retry button for failed posts** — calls `POST /api/posts/:id/retry`, re-enqueues the posting job

- [ ] **Step 3: Add auto-refresh** — poll `GET /api/posts` every 10 seconds to show live posting status

- [ ] **Step 4: Verify post monitor works end-to-end**

- [ ] **Step 5: Commit**

```bash
git add src/web/dashboard/
# Commit message: "feat: post monitor page — live posting status, retry failed posts"
```

---

## Task 16: Dashboard — Vertical Management Page

**Files:**
- Modify: `src/web/dashboard/src/pages/VerticalManagement.tsx`

- [ ] **Step 1: Implement VerticalManagement page** — shows verticals with data sources, trigger rules, content templates. Toggle switches for enable/disable. See `docs/ux/wireframes/r1/03-vertical-management.md`.

- [ ] **Step 2: Verify toggle works**

- [ ] **Step 3: Commit**

```bash
git add src/web/dashboard/
# Commit message: "feat: vertical management page — view config, toggle rules"
```

---

## Task 17: Docker Compose + Integration

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM node:22-slim

# Puppeteer dependencies
RUN apt-get update && apt-get install -y \
    chromium fonts-liberation libappindicator3-1 libasound2 \
    libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 \
    libgdk-pixbuf2.0-0 libnspr4 libnss3 libx11-xcb1 libxcomposite1 \
    libxdamage1 libxrandr2 xdg-utils \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .

VOLUME /app/assets
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
services:
  web:
    build: .
    command: npx tsx src/web/index.ts
    ports:
      - "${PORT:-3000}:3000"
    env_file: .env
    volumes:
      - assets:/app/assets
    depends_on: []

  worker:
    build: .
    command: npx tsx src/worker/index.ts
    env_file: .env
    volumes:
      - assets:/app/assets
    depends_on: []

volumes:
  assets:
```

- [ ] **Step 3: Test docker compose up**

```bash
docker compose build
docker compose up
```

Verify: web process starts on port 3000, worker process starts polling, dashboard loads in browser.

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml
# Commit message: "feat: Docker Compose — web + worker with shared asset volume"
```

---

## Task 18: End-to-End Verification

- [ ] **Step 1: Run migrations and seed**

```bash
npx drizzle-kit migrate
psql $DATABASE_URL -f db/seed.sql
```

- [ ] **Step 2: Start the system**

```bash
docker compose up
```

- [ ] **Step 3: Walk through the full pipeline**

1. Worker polls CoinGecko and exchangerate.host
2. If no natural trigger fires, temporarily lower a trigger threshold in the DB to force a fire
3. Verify content_item appears in dashboard review queue
4. Approve a content item → verify post row created and post-to-platform job enqueued
5. Worker picks up posting job → verify tweet posted via Twitter API
6. Dashboard post monitor shows posted status with tweet ID

- [ ] **Step 4: Verify all success criteria from spec Section 11**

Walk through each checkbox in the spec and verify manually.

- [ ] **Step 5: Final commit**

```bash
git add -A
# Commit message: "chore: end-to-end verification complete for Core Pipeline MVP"
```
