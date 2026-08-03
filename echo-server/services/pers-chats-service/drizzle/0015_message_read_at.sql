ALTER TABLE "personal_messages" ADD COLUMN IF NOT EXISTS "read_at" timestamp;

-- Backfill historical messages: any message whose author already has a
-- lastReadAt from the other party >= its createdAt is considered read.
UPDATE "personal_messages" m
SET "read_at" = r."last_read_at"
FROM "personal_chat_reads" r
JOIN "personal_chats" c ON c."id" = r."chat_id"
WHERE m."chat_id" = r."chat_id"
	AND m."author_id" <> r."user_id"
	AND r."last_read_at" >= m."created_at"
	AND m."read_at" IS NULL;
