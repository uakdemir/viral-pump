ALTER TABLE "content_items" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trigger_rules" ADD COLUMN "schedule" text;--> statement-breakpoint
ALTER TABLE "trigger_rules" ADD COLUMN "next_scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content_templates" ADD CONSTRAINT "uq_content_templates_vertical_name" UNIQUE("vertical_id","name");