import { config as loadEnv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Services run with cwd = their own dir (pnpm --filter), where a plain
// dotenv/config would find no .env — shared dev vars live in the repo root.
// Real env vars (docker compose) take precedence over the file.
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });

export const config = {
	port: Number(process.env.PORT) || 3006,
	databaseUrl: process.env.BLOB_DATABASE_URL || process.env.DATABASE_URL!,
	jwtSecret: process.env.JWT_SECRET!,
	natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
	persChatsServiceUrl: process.env.PERS_CHATS_SERVICE_URL || 'http://localhost:3003',
	groupsServiceUrl: process.env.GROUPS_SERVICE_URL || 'http://localhost:3007',
	internalApiKey: process.env.INTERNAL_API_KEY || 'dev-internal-key',
	// 'local' keeps blobs in uploads/blobs on disk; 's3' targets any
	// S3-compatible store (MinIO in dev, R2/B2 in prod) via the S3_* vars.
	storageDriver: (process.env.STORAGE_DRIVER === 's3' ? 's3' : 'local') as 's3' | 'local',
	s3: {
		endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
		region: process.env.S3_REGION || 'us-east-1',
		bucket: process.env.S3_BUCKET || 'echo-blobs',
		accessKeyId: process.env.S3_ACCESS_KEY || '',
		secretAccessKey: process.env.S3_SECRET_KEY || '',
		forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
	},
};
