CREATE TABLE "group_members_mirror" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(16) DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_cache" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_channels" ADD CONSTRAINT "voice_channels_created_by_user_cache_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_gmm_group_user" ON "group_members_mirror" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_gmm_user" ON "group_members_mirror" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_uc_username" ON "user_cache" USING btree ("username");--> statement-breakpoint
CREATE INDEX "idx_vc_group" ON "voice_channels" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_vc_group_name" ON "voice_channels" USING btree ("group_id","name");