import { pgTable, uuid, text, jsonb, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('uq_content_templates_vertical_name').on(table.verticalId, table.name),
]);
