-- Create friendship_cache. This table was declared in schema.ts from day one
-- but never had a migration nor a NATS writer, so it had been silently empty.
-- Now populated by the bootstrap/reconciler that pulls from friends-service.
CREATE TABLE IF NOT EXISTS "friendship_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user1_id" uuid NOT NULL,
	"user2_id" uuid NOT NULL,
	"status" varchar(16) NOT NULL,
	"requester_id" uuid NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_fc_users" ON "friendship_cache" ("user1_id", "user2_id");
