ALTER TABLE "groups" ADD COLUMN "message_policy" varchar(16) DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "pin_policy" varchar(16) DEFAULT 'admins' NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "edit_info_policy" varchar(16) DEFAULT 'admins' NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "history_visible" boolean DEFAULT true NOT NULL;
