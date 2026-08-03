-- Pre-generated thumbnail metadata for image blobs. Nullable: only set for
-- image uploads, and only for rows created after this migration.
ALTER TABLE "file_blobs" ADD COLUMN IF NOT EXISTS "thumb_stored_name" text;
--> statement-breakpoint
ALTER TABLE "file_blobs" ADD COLUMN IF NOT EXISTS "thumb_size" integer;
