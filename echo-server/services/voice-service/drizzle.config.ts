import { defineConfig } from 'drizzle-kit';
import { config as loadEnv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// drizzle-kit runs with cwd = this service dir; the shared DB URLs live in the
// repo-root .env, so load it explicitly.
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

export default defineConfig({
	out: './drizzle',
	schema: './src/db/schema.ts',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.VOICE_DATABASE_URL || process.env.DATABASE_URL!,
	},
});
