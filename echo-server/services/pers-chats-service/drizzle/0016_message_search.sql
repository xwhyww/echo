-- Plaintext-backed search index for messages.
-- Populated in the application layer on insert/edit from decrypted content.
-- 'simple' dictionary: language-agnostic tokenizer, no stemming — works for
-- mixed Cyrillic/Latin without language detection.

ALTER TABLE "personal_messages" ADD COLUMN IF NOT EXISTS "content_search" tsvector;

CREATE INDEX IF NOT EXISTS "idx_pm_content_search"
	ON "personal_messages" USING GIN ("content_search");
