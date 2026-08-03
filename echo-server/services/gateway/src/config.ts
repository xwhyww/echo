import { config as loadEnv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Services run with cwd = their own dir (pnpm --filter), where a plain
// dotenv/config would find no .env — shared dev vars live in the repo root.
// Real env vars (docker compose) take precedence over the file.
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });

export const config = {
	port: Number(process.env.PORT) || 3000,
	jwtSecret: process.env.JWT_SECRET!,
	authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
	userServiceUrl: process.env.USER_SERVICE_URL || 'http://localhost:3002',
	persChatsServiceUrl: process.env.PERS_CHATS_SERVICE_URL || 'http://localhost:3003',
	friendsServiceUrl: process.env.FRIENDS_SERVICE_URL || 'http://localhost:3005',
	wsGatewayUrl: process.env.WS_GATEWAY_URL || 'ws://localhost:3004',
	blobServiceUrl: process.env.BLOB_SERVICE_URL || 'http://localhost:3006',
	groupsServiceUrl: process.env.GROUPS_SERVICE_URL || 'http://localhost:3007',
	voiceServiceUrl: process.env.VOICE_SERVICE_URL || 'http://localhost:3008',
};
