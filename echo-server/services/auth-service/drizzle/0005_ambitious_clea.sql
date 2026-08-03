ALTER TABLE "users" ADD COLUMN "privacy_profile" varchar(16) DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "privacy_photo" varchar(16) DEFAULT 'all' NOT NULL;