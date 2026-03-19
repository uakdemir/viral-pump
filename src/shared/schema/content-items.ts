import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
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
  editedAt: timestamp('edited_at', { withTimezone: true }),
  tags: jsonb('tags').notNull().default([]),
  aiConfig: jsonb('ai_config').notNull().default({}),
  cost: jsonb('cost').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
}, (table) => [
  index('idx_content_items_review').on(table.reviewStatus)
    .where(sql`generation_status = 'ready' AND review_status = 'pending'`),
]);
