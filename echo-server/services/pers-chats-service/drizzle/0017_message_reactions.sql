-- One-reaction-per-user-per-message.
-- The unique index makes "swap my reaction" a single upsert on (message_id, user_id).

CREATE TABLE IF NOT EXISTS "personal_message_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"message_id" uuid NOT NULL REFERENCES "personal_messages"("id") ON DELETE CASCADE,
	"user_id" uuid NOT NULL REFERENCES "user_cache"("id"),
	"emoji" text NOT NULL,
	"created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_pmr_user_message"
	ON "personal_message_reactions" ("user_id", "message_id");

CREATE INDEX IF NOT EXISTS "idx_pmr_message"
	ON "personal_message_reactions" ("message_id");
