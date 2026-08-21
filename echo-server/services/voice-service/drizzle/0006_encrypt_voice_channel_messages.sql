ALTER TABLE "voice_channel_messages" ADD COLUMN "content_ciphertext" "bytea";--> statement-breakpoint
ALTER TABLE "voice_channel_messages" ADD COLUMN "content_nonce" "bytea";--> statement-breakpoint
ALTER TABLE "voice_channel_messages" ADD COLUMN "reply_to_snapshot_ciphertext" "bytea";--> statement-breakpoint
ALTER TABLE "voice_channel_messages" ADD COLUMN "reply_to_snapshot_nonce" "bytea";--> statement-breakpoint
ALTER TABLE "voice_channel_messages" ADD COLUMN "reply_to_snapshot_key_id" smallint;--> statement-breakpoint
ALTER TABLE "voice_channel_messages" ADD COLUMN "attachments_ciphertext" "bytea";--> statement-breakpoint
ALTER TABLE "voice_channel_messages" ADD COLUMN "attachments_nonce" "bytea";--> statement-breakpoint
ALTER TABLE "voice_channel_messages" ADD COLUMN "attachments_key_id" smallint;--> statement-breakpoint
ALTER TABLE "voice_channel_messages" ADD COLUMN "attachments_meta" jsonb;