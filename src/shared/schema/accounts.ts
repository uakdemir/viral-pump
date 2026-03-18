import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
