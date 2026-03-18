import { pgTable, uuid, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const verticals = pgTable('verticals', {
  id: uuid('id').defaultRandom().primaryKey(),
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  depth: integer('depth').notNull().default(0),
  config: jsonb('config').notNull().default({}),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
