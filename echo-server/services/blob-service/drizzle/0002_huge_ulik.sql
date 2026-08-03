CREATE TABLE IF NOT EXISTS "group_members_mirror" (
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "group_members_mirror_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "file_blobs" ADD COLUMN IF NOT EXISTS "thumb_stored_name" text;--> statement-breakpoint
ALTER TABLE "file_blobs" ADD COLUMN IF NOT EXISTS "thumb_size" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_members_mirror_user_idx" ON "group_members_mirror" USING btree ("user_id");
