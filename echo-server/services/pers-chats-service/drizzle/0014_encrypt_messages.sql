-- Additive migration for Plan A (server-side at-rest message encryption).
-- All new columns are nullable so existing rows remain valid; new writes
-- populate the ciphertext columns and leave the plaintext columns as
-- sentinel empty values. A follow-up migration drops the plaintext
-- columns once a backfill re-encrypts historical data.

ALTER TABLE "personal_messages"
	ADD COLUMN "content_ciphertext" bytea,
	ADD COLUMN "content_nonce" bytea,
	ADD COLUMN "content_key_id" smallint,
	ADD COLUMN "reply_to_snapshot_ciphertext" bytea,
	ADD COLUMN "reply_to_snapshot_nonce" bytea,
	ADD COLUMN "reply_to_snapshot_key_id" smallint,
	ADD COLUMN "attachments_ciphertext" bytea,
	ADD COLUMN "attachments_nonce" bytea,
	ADD COLUMN "attachments_key_id" smallint,
	ADD COLUMN "attachments_meta" jsonb;
