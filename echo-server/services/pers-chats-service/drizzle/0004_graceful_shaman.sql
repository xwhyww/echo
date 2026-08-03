ALTER TABLE "personal_messages" ADD COLUMN "pinned_at" timestamp;--> statement-breakpoint
ALTER TABLE "personal_messages" ADD COLUMN "pinned_by" uuid;--> statement-breakpoint
ALTER TABLE "personal_messages" ADD CONSTRAINT "personal_messages_pinned_by_user_cache_id_fk" FOREIGN KEY ("pinned_by") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pm_chat_pinned" ON "personal_messages" USING btree ("chat_id","pinned_at");