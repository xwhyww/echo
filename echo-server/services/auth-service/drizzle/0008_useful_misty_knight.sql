CREATE TABLE "phone_otps" (
	"phone" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"last_sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
-- Phone becomes the login identity; legacy email-only dev accounts have no
-- way to sign in through the OTP flow, so drop them before the constraint.
DELETE FROM "users" WHERE "phone" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "phone" SET NOT NULL;--> statement-breakpoint
-- IF NOT EXISTS: these two already exist in databases migrated before the
-- snapshot drift was healed; drizzle re-generated them into this migration.
ALTER TABLE "user_avatars" ADD COLUMN IF NOT EXISTS "hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "privacy_group_invite" varchar(16) DEFAULT 'all' NOT NULL;