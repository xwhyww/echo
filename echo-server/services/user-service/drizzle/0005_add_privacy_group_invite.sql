ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "privacy_group_invite" varchar(16) DEFAULT 'all' NOT NULL;
