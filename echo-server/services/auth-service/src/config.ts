import { config as loadEnv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Services run with cwd = their own dir (pnpm --filter), where a plain
// dotenv/config would find no .env — shared dev vars live in the repo root.
// Real env vars (docker compose) take precedence over the file.
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });

export const config = {
	port: Number(process.env.PORT) || 3001,
	databaseUrl: process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL!,
	jwtSecret: process.env.JWT_SECRET!,
	natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
	blobServiceUrl: process.env.BLOB_SERVICE_URL || 'http://localhost:3006',
};
