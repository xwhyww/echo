CREATE TABLE "personal_message_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_message_deletions" ADD CONSTRAINT "personal_message_deletions_message_id_personal_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."personal_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_message_deletions" ADD CONSTRAINT "personal_message_deletions_user_id_user_cache_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pmd_user_message" ON "personal_message_deletions" USING btree ("user_id","message_id");--> statement-breakpoint
CREATE INDEX "idx_pmd_user" ON "personal_message_deletions" USING btree ("user_id");