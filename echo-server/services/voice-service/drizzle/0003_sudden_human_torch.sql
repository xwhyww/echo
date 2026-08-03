CREATE TABLE "voice_channel_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_channels" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "voice_channel_categories" ADD CONSTRAINT "voice_channel_categories_created_by_user_cache_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_vcc_group" ON "voice_channel_categories" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_vcc_group_name" ON "voice_channel_categories" USING btree ("group_id","name");--> statement-breakpoint
CREATE INDEX "idx_vc_category" ON "voice_channels" USING btree ("category_id");