CREATE TABLE "notification_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"direct_messages" boolean DEFAULT true NOT NULL,
	"group_messages" boolean DEFAULT true NOT NULL,
	"friend_requests" boolean DEFAULT true NOT NULL,
	"group_invites" boolean DEFAULT true NOT NULL,
	"show_preview" boolean,
	"muted_chats" text[] DEFAULT '{}' NOT NULL,
	"muted_groups" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
