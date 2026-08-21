import { config as loadEnv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEncryptionKeys } from '@echo/shared';

// Services run with cwd = their own dir (pnpm --filter), where a plain
// dotenv/config would find no .env — shared dev vars live in the repo root.
// Real env vars (docker compose) take precedence over the file.
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });

export const config = {
	port: Number(process.env.PORT) || 3008,
	databaseUrl: process.env.VOICE_DATABASE_URL || process.env.DATABASE_URL!,
	jwtSecret: process.env.JWT_SECRET!,
	natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
	redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
	userServiceUrl: process.env.USER_SERVICE_URL || 'http://localhost:3002',
	groupsServiceUrl: process.env.GROUPS_SERVICE_URL || 'http://localhost:3007',
	blobServiceUrl: process.env.BLOB_SERVICE_URL || 'http://localhost:3006',
	internalApiKey: process.env.INTERNAL_API_KEY || 'dev-internal-key',
	livekitUrl: process.env.LIVEKIT_URL || 'ws://localhost:7880',
	// URL handed back to browser clients. In Docker the internal LIVEKIT_URL
	// (ws://livekit:7880) isn't resolvable from the user's machine, so we
	// expose a separate public-facing URL that points at the host port.
	livekitPublicUrl: process.env.LIVEKIT_PUBLIC_URL || process.env.LIVEKIT_URL || 'ws://localhost:7880',
	livekitApiKey: process.env.LIVEKIT_API_KEY!,
	livekitApiSecret: process.env.LIVEKIT_API_SECRET!,

	/**
	 * Message encryption keys for the voice-channel chats, indexed by the
	 * `key_id` column each encrypted row carries. The same
	 * `MESSAGE_ENCRYPTION_KEY` as pers-chats and groups: one key, one backup to
	 * keep, one thing to lose.
	 */
	encryption: loadEncryptionKeys(
		process.env.MESSAGE_ENCRYPTION_KEY,
		process.env.MESSAGE_ENCRYPTION_CURRENT_KEY_ID,
	),
};
