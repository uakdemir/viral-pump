import { pgTable, uuid, text, jsonb, timestamp, boolean, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { contentItems } from './content-items.js';
import { accounts } from './accounts.js';

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contentId: uuid('content_id')
      .notNull()
      .references(() => contentItems.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    status: text('status').notNull().default('ready'),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    platformPostId: text('platform_post_id'),
    url: text('url'),
    failureReason: text('failure_reason'),
    metrics: jsonb('metrics').notNull().default({}),
    cost: jsonb('cost').notNull().default({}),
    lastMetricsCollectedAt: timestamp('last_metrics_collected_at', { withTimezone: true }),
    metricsDisabled: boolean('metrics_disabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    unique('uq_posts_content_account').on(table.contentId, table.accountId),
    index('idx_posts_status')
      .on(table.status)
      .where(sql`status = 'ready'`),
  ],
);
