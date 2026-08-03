-- Drop dead file_blobs / raw_blob_map tables. These were the original
-- pers-chats-owned blob storage; ownership moved to blob-service (which has
-- its own copies in echo_blobs). The schema declarations and any data left
-- in echo_chats are stale.
DROP TABLE IF EXISTS "raw_blob_map";
--> statement-breakpoint
DROP TABLE IF EXISTS "file_blobs";
