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
	pushServiceUrl: process.env.PUSH_SERVICE_URL || 'http://localhost:3009',
	// Backs the edge rate limiter. Optional: without it the limiter keeps its
	// counters in process, which is the same guarantee while the gateway is a
	// single instance.
	redisUrl: process.env.REDIS_URL,
	rateLimits: {
		// Per client address, per 15 minutes, on POST /auth/otp/request. The
		// number is an env var because the right value depends on how much
		// carrier NAT sits in front of the users, and that is not knowable from
		// here.
		otpRequestsPerWindow: Number(process.env.RATE_LIMIT_OTP_REQUESTS) || 10,
		// Per client address, per minute, on everything else.
		globalPerMinute: Number(process.env.RATE_LIMIT_GLOBAL_PER_MINUTE) || 600,
	},
	// Comma-separated web origins allowed to call the API with credentials.
	// Required in production — localhost/LAN origins are dev-only (see app.ts).
	allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
		.split(',')
		.map((o) => o.trim())
		.filter(Boolean),
};
