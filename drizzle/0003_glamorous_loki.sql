ALTER TABLE "content_items" ADD COLUMN "media_meta" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "content_templates" ADD COLUMN "platform_meta" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "failure_reason" text;