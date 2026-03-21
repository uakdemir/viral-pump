import { pgTable, uuid, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { verticals } from './verticals.js';

export const dataSources = pgTable('data_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  verticalId: uuid('vertical_id').notNull().references(() => verticals.id),
  provider: text('provider').notNull(),
  config: jsonb('config').notNull().default({}),
  pollIntervalMs: integer('poll_interval_ms').notNull().default(60000),
  status: text('status').notNull().default('active'),
  lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
