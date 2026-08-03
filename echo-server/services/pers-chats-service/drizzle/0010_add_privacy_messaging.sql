ALTER TABLE "user_cache" ADD COLUMN IF NOT EXISTS "privacy_messaging" varchar(16) DEFAULT 'all' NOT NULL;
