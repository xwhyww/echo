CREATE TABLE "personal_message_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_message_links" ADD CONSTRAINT "personal_message_links_message_id_personal_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."personal_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_message_links" ADD CONSTRAINT "personal_message_links_chat_id_personal_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."personal_chats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pml_chat_created" ON "personal_message_links" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_pml_message" ON "personal_message_links" USING btree ("message_id");--> statement-breakpoint
-- Backfill: extract URLs from existing messages
INSERT INTO "personal_message_links" ("message_id", "chat_id", "url", "created_at")
SELECT pm.id, pm.chat_id, (regexp_matches(pm.content, 'https?://[^\s)>\]]+', 'g'))[1], pm.created_at
FROM personal_messages pm
WHERE pm.content ~ 'https?://';
