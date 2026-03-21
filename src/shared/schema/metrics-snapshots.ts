import { pgTable, uuid, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { posts } from './posts.js';

export const metricsSnapshots = pgTable(
  'metrics_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
    metrics: jsonb('metrics').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('idx_metrics_snapshots_post').on(table.postId, table.collectedAt)],
);
