CREATE TABLE "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"environment" text DEFAULT 'sandbox' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_device_token" UNIQUE("token")
);
--> statement-breakpoint
CREATE INDEX "device_tokens_user_idx" ON "device_tokens" USING btree ("user_id");