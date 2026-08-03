ALTER TABLE "personal_messages" ADD COLUMN "reply_to_id" uuid;--> statement-breakpoint
ALTER TABLE "personal_messages" ADD COLUMN "reply_to_snapshot" jsonb;