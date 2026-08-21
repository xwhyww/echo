-- At-rest encryption for group messages, mirroring personal_messages'
-- 0014_encrypt_messages. Every column is nullable: existing rows keep their
-- plaintext until `pnpm encrypt:backfill` re-encrypts them, and the read path
-- prefers ciphertext only where it is present.
--
-- Hand-trimmed. `drizzle-kit generate` also emitted the group policy columns and
-- user_cache.privacy_group_invite, because migrations 0001-0003 in this service
-- were written by hand and their meta snapshots were never recorded — so drizzle
-- believes the schema still stands at 0000 and re-proposes everything since.
-- Those columns are already in every database that has run 0001-0003, and
-- re-adding them would fail the boot-time migration and take the service down.
-- This file's snapshot does capture the full schema, so the drift ends here.
ALTER TABLE "group_messages" ADD COLUMN "content_ciphertext" "bytea";--> statement-breakpoint
ALTER TABLE "group_messages" ADD COLUMN "content_nonce" "bytea";--> statement-breakpoint
ALTER TABLE "group_messages" ADD COLUMN "reply_to_snapshot_ciphertext" "bytea";--> statement-breakpoint
ALTER TABLE "group_messages" ADD COLUMN "reply_to_snapshot_nonce" "bytea";--> statement-breakpoint
ALTER TABLE "group_messages" ADD COLUMN "reply_to_snapshot_key_id" smallint;--> statement-breakpoint
ALTER TABLE "group_messages" ADD COLUMN "attachments_ciphertext" "bytea";--> statement-breakpoint
ALTER TABLE "group_messages" ADD COLUMN "attachments_nonce" "bytea";--> statement-breakpoint
ALTER TABLE "group_messages" ADD COLUMN "attachments_key_id" smallint;--> statement-breakpoint
ALTER TABLE "group_messages" ADD COLUMN "attachments_meta" jsonb;
