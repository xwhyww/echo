ALTER TABLE "group_members_mirror" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "group_members_mirror" CASCADE;--> statement-breakpoint
DROP INDEX "idx_vc_group";--> statement-breakpoint
DROP INDEX "idx_vc_group_name";--> statement-breakpoint
CREATE INDEX "idx_vc_created_by" ON "voice_channels" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "voice_channels" DROP COLUMN "group_id";