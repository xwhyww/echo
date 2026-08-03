import { config as loadEnv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseKey } from '@echo/shared';

// Services run with cwd = their own dir (pnpm --filter), where a plain
// dotenv/config would find no .env — shared dev vars live in the repo root.
// Real env vars (docker compose) take precedence over the file.
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });

// Encryption keys are indexed by key_id (smallint column on each encrypted row).
// Current key_id — used for new writes. Older rows keep their own key_id and
// we decrypt using whichever key matches. To rotate: register the new key under
// a new id (e.g. `2:<base64>`), bump CURRENT_KEY_ID, and run a backfill at
// leisure to re-encrypt old rows.
function loadKeys(): { keys: Map<number, Buffer>; currentKeyId: number } {
	const raw = process.env.MESSAGE_ENCRYPTION_KEY;
	if (!raw) {
		throw new Error('MESSAGE_ENCRYPTION_KEY is required (base64-encoded 32 bytes)');
	}
	const keys = new Map<number, Buffer>();
	// Support either "<b64>" (implicit key_id 1) or "id:<b64>,id:<b64>,..."
	if (raw.includes(':')) {
		for (const part of raw.split(',')) {
			const [idStr, b64] = part.trim().split(':');
			const id = Number(idStr);
			if (!Number.isInteger(id) || id < 1) throw new Error(`invalid key_id in MESSAGE_ENCRYPTION_KEY: ${idStr}`);
			keys.set(id, parseKey(b64));
		}
	} else {
		keys.set(1, parseKey(raw));
	}
	const currentKeyId = Number(process.env.MESSAGE_ENCRYPTION_CURRENT_KEY_ID || Math.max(...keys.keys()));
	if (!keys.has(currentKeyId)) {
		throw new Error(`MESSAGE_ENCRYPTION_CURRENT_KEY_ID=${currentKeyId} not present in MESSAGE_ENCRYPTION_KEY`);
	}
	return { keys, currentKeyId };
}

const { keys, currentKeyId } = loadKeys();

export const config = {
	port: Number(process.env.PORT) || 3003,
	databaseUrl: process.env.CHATS_DATABASE_URL || process.env.DATABASE_URL!,
	jwtSecret: process.env.JWT_SECRET!,
	natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
	userServiceUrl: process.env.USER_SERVICE_URL || 'http://localhost:3002',
	friendsServiceUrl: process.env.FRIENDS_SERVICE_URL || 'http://localhost:3005',
	blobServiceUrl: process.env.BLOB_SERVICE_URL || 'http://localhost:3006',
	internalApiKey: process.env.INTERNAL_API_KEY || 'dev-internal-key',
	encryptionKeys: keys,
	currentKeyId,
};
