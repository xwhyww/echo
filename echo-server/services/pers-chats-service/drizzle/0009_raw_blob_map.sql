CREATE TABLE IF NOT EXISTS "raw_blob_map" (
	"raw_hash" text PRIMARY KEY NOT NULL,
	"file_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "raw_blob_map" ADD CONSTRAINT "raw_blob_map_file_hash_file_blobs_hash_fk"
	FOREIGN KEY ("file_hash") REFERENCES "file_blobs"("hash") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
