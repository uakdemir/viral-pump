import { pgTable, uuid, text, integer, jsonb, boolean, timestamp } from 'drizzle-orm/pg-core';
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
  schedule: text('schedule'),  // cron expression for fire_mode = 'scheduled'
  nextScheduledAt: timestamp('next_scheduled_at', { withTimezone: true }),
  lastPredicateResult: boolean('last_predicate_result'),
  lastFiredAt: timestamp('last_fired_at', { withTimezone: true }),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
