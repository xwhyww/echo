CREATE TABLE "group_members_mirror" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(16) DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "idx_vc_created_by";--> statement-breakpoint
TRUNCATE TABLE "voice_channels";--> statement-breakpoint
ALTER TABLE "voice_channels" ADD COLUMN "group_id" uuid NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_gmm_group_user" ON "group_members_mirror" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_gmm_user" ON "group_members_mirror" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_vc_group" ON "voice_channels" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_vc_group_name" ON "voice_channels" USING btree ("group_id","name");