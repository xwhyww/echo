CREATE TABLE "voice_channel_role_access" (
	"channel_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_role_members" (
	"role_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_by" uuid NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" varchar(9),
	"permissions" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_channel_role_access" ADD CONSTRAINT "voice_channel_role_access_channel_id_voice_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."voice_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_channel_role_access" ADD CONSTRAINT "voice_channel_role_access_role_id_voice_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."voice_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_role_members" ADD CONSTRAINT "voice_role_members_role_id_voice_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."voice_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_roles" ADD CONSTRAINT "voice_roles_created_by_user_cache_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_vcra_channel_role" ON "voice_channel_role_access" USING btree ("channel_id","role_id");--> statement-breakpoint
CREATE INDEX "idx_vcra_role" ON "voice_channel_role_access" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_vrm_role_user" ON "voice_role_members" USING btree ("role_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_vrm_user" ON "voice_role_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_vr_group" ON "voice_roles" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_vr_group_name" ON "voice_roles" USING btree ("group_id","name");