ALTER TABLE "user_cache" ADD COLUMN IF NOT EXISTS "privacy_group_invite" varchar(16) DEFAULT 'all' NOT NULL;
