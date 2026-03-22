import { newDb, DataType } from 'pg-mem';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../src/shared/schema/index.js';
import type { DB } from '../../src/shared/db.js';
import crypto from 'node:crypto';

/**
 * Raw DDL statements to create all 9 tables in dependency order.
 * Partial indexes are omitted — pg-mem does not support WHERE on CREATE INDEX.
 */
const TABLE_DDL = `
CREATE TABLE verticals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  depth INTEGER NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id UUID NOT NULL REFERENCES verticals(id),
  platform TEXT NOT NULL,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  market TEXT NOT NULL DEFAULT 'global',
  credentials JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id UUID NOT NULL REFERENCES verticals(id),
  provider TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  poll_interval_ms INTEGER NOT NULL DEFAULT 60000,
  status TEXT NOT NULL DEFAULT 'active',
  last_polled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE trigger_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id UUID NOT NULL REFERENCES verticals(id),
  name TEXT NOT NULL,
  condition JSONB NOT NULL,
  fire_mode TEXT NOT NULL DEFAULT 'threshold_cross',
  cooldown_ms INTEGER NOT NULL DEFAULT 3600000,
  lookback_window_ms INTEGER NOT NULL DEFAULT 300000,
  content_config JSONB NOT NULL DEFAULT '{}',
  schedule TEXT,
  next_scheduled_at TIMESTAMPTZ,
  last_predicate_result BOOLEAN,
  last_fired_at TIMESTAMPTZ,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE content_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id UUID NOT NULL REFERENCES verticals(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  content_layer TEXT NOT NULL,
  platform TEXT,
  prompt_template TEXT NOT NULL,
  visual_template JSONB NOT NULL DEFAULT '{}',
  platform_meta JSONB NOT NULL DEFAULT '{}',
  generation_config JSONB NOT NULL DEFAULT '{}',
  tags JSONB NOT NULL DEFAULT '[]',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vertical_id, name)
);

CREATE TABLE content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id UUID NOT NULL REFERENCES verticals(id),
  template_id UUID REFERENCES content_templates(id),
  event_data JSONB NOT NULL DEFAULT '{}',
  generated_text TEXT,
  visual_url TEXT,
  media_meta JSONB NOT NULL DEFAULT '{}',
  generation_status TEXT NOT NULL DEFAULT 'generating',
  review_status TEXT NOT NULL DEFAULT 'draft',
  final_text TEXT,
  review_notes TEXT,
  edited_at TIMESTAMPTZ,
  tags JSONB NOT NULL DEFAULT '[]',
  ai_config JSONB NOT NULL DEFAULT '{}',
  cost JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content_items(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  status TEXT NOT NULL DEFAULT 'ready',
  posted_at TIMESTAMPTZ,
  platform_post_id TEXT,
  url TEXT,
  failure_reason TEXT,
  metrics JSONB NOT NULL DEFAULT '{}',
  cost JSONB NOT NULL DEFAULT '{}',
  last_metrics_collected_at TIMESTAMPTZ,
  metrics_disabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(content_id, account_id)
);

CREATE TABLE job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id),
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metrics JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

/** The raw test DB type — NodePgDatabase with the project schema */
export type TestDB = NodePgDatabase<typeof schema>;

export interface TestDb {
  /** DB instance cast to the project's DB type for handler compatibility */
  db: DB;
  /** The same DB without casting, for direct use in tests */
  rawDb: TestDB;
  close: () => void;
}

/**
 * Patches a pg-mem mock Pool to work with drizzle-orm/node-postgres.
 *
 * pg-mem v3.x throws on two features that Drizzle's node-postgres adapter uses:
 *   1. `types: { getTypeParser }` in query configs
 *   2. `rowMode: 'array'` in query configs
 *
 * This wrapper strips both properties before queries reach pg-mem, and when
 * `rowMode: 'array'` was requested, converts the object-based result rows
 * into arrays (ordered by the result's field list).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function patchPool(pool: any): void {
  const originalQuery = pool.query.bind(pool);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pool.query = (...args: any[]) => {
    let wantArrayMode = false;

    // Query can be called as:
    //   query(text, values?, callback?)
    //   query(config, callback?)
    // When first arg is an object (QueryConfig), strip unsupported props
    if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      const { types: _types, rowMode, ...rest } = args[0];
      wantArrayMode = rowMode === 'array';
      args[0] = rest;
    }

    const result = originalQuery(...args);

    if (!wantArrayMode) {
      return result;
    }

    // Convert object rows to array rows when rowMode was 'array'.
    // Drizzle expects rows as arrays where values are ordered by field index.
    if (result && typeof result.then === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return result.then((res: any) => convertToArrayRows(res));
    }
    return convertToArrayRows(result);
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertToArrayRows(res: any): any {
  if (!res || !res.rows || res.rows.length === 0) return res;

  // pg-mem may return empty fields array; derive field order from the first row's keys.
  // Object.keys preserves insertion order, which matches the SELECT column order.
  const fieldNames =
    res.fields && res.fields.length > 0
      ? res.fields.map((f: { name: string }) => f.name)
      : Object.keys(res.rows[0]);

  return {
    ...res,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows: res.rows.map((row: Record<string, unknown>) =>
      fieldNames.map((name: string) => row[name]),
    ),
  };
}

/**
 * Creates an in-memory PostgreSQL database using pg-mem,
 * initializes all tables, and returns a Drizzle DB instance.
 *
 * Uses pg-mem's createPg() adapter with drizzle-orm/node-postgres.
 * The returned DB type (NodePgDatabase) differs from production's
 * PostgresJsDatabase, but both extend PgDatabase and share the
 * same query-builder API (select/insert/update/delete).
 */
export function createTestDb(): TestDb {
  const mem = newDb();

  // Register gen_random_uuid() — pg-mem doesn't include it by default
  mem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    implementation: () => crypto.randomUUID(),
    impure: true,
  });

  // Create all tables via raw DDL
  mem.public.none(TABLE_DDL);

  // Get a node-postgres compatible Pool from pg-mem
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();

  // Patch the pool to work around pg-mem's limitations with
  // getTypeParser and rowMode that drizzle-orm/node-postgres requires
  patchPool(pool);

  const rawDb: TestDB = drizzle(pool, { schema });

  return {
    db: rawDb as unknown as DB,
    rawDb,
    close: () => {
      // pg-mem pool is in-memory; end() may be a no-op but call for consistency
      try {
        pool.end();
      } catch {
        // Ignore — pg-mem mock pool may not implement end()
      }
    },
  };
}
