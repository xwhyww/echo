ALTER TABLE "users" ADD COLUMN "privacy_online_status" varchar(16) DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "privacy_phone" varchar(16) DEFAULT 'friends' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "privacy_email" varchar(16) DEFAULT 'friends' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "privacy_messaging" varchar(16) DEFAULT 'all' NOT NULL;