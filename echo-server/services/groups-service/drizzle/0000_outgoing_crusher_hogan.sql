CREATE TABLE "group_chat_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"inviter_id" uuid NOT NULL,
	"invitee_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(16) DEFAULT 'member' NOT NULL,
	"nickname" text,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_message_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_message_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_message_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"pinned_at" timestamp,
	"pinned_by" uuid,
	"system_kind" varchar(24),
	"reply_to_id" uuid,
	"reply_to_snapshot" jsonb,
	"forwarded_from" jsonb,
	"content_key_id" smallint
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"avatar_url" text,
	"owner_id" uuid NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"invite_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_cache" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"is_online" boolean DEFAULT false NOT NULL,
	"privacy_online_status" varchar(16) DEFAULT 'all' NOT NULL,
	"privacy_messaging" varchar(16) DEFAULT 'all' NOT NULL,
	"privacy_photo" varchar(16) DEFAULT 'all' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_chat_reads" ADD CONSTRAINT "group_chat_reads_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_chat_reads" ADD CONSTRAINT "group_chat_reads_user_id_user_cache_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_inviter_id_user_cache_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_invitee_id_user_cache_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_user_cache_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_message_deletions" ADD CONSTRAINT "group_message_deletions_message_id_group_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."group_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_message_deletions" ADD CONSTRAINT "group_message_deletions_user_id_user_cache_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_message_links" ADD CONSTRAINT "group_message_links_message_id_group_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."group_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_message_links" ADD CONSTRAINT "group_message_links_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_message_reactions" ADD CONSTRAINT "group_message_reactions_message_id_group_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."group_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_message_reactions" ADD CONSTRAINT "group_message_reactions_user_id_user_cache_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_author_id_user_cache_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_pinned_by_user_cache_id_fk" FOREIGN KEY ("pinned_by") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_user_cache_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_gcr_user_group" ON "group_chat_reads" USING btree ("user_id","group_id");--> statement-breakpoint
CREATE INDEX "idx_gi_invitee_status" ON "group_invites" USING btree ("invitee_id","status");--> statement-breakpoint
CREATE INDEX "idx_gi_group_status" ON "group_invites" USING btree ("group_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_gi_group_invitee_pending" ON "group_invites" USING btree ("group_id","invitee_id") WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "idx_gm_group_user" ON "group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_gm_user" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_gmd_user_message" ON "group_message_deletions" USING btree ("user_id","message_id");--> statement-breakpoint
CREATE INDEX "idx_gmd_user" ON "group_message_deletions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_gml_group_created" ON "group_message_links" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_gml_message" ON "group_message_links" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_gmr_user_message" ON "group_message_reactions" USING btree ("user_id","message_id");--> statement-breakpoint
CREATE INDEX "idx_gmr_message" ON "group_message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_gmsg_group_created" ON "group_messages" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_gmsg_group_pinned" ON "group_messages" USING btree ("group_id","pinned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_groups_invite_code" ON "groups" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "idx_groups_owner" ON "groups" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_uc_username" ON "user_cache" USING btree ("username");