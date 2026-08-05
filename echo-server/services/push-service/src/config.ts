import { config as loadEnv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Services run with cwd = their own dir (pnpm --filter), where a plain
// dotenv/config would find no .env — shared dev vars live in the repo root.
// Real env vars (docker compose) take precedence over the file.
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });

export const config = {
	port: Number(process.env.PORT) || 3009,
	databaseUrl: process.env.PUSH_DATABASE_URL || process.env.DATABASE_URL!,
	jwtSecret: process.env.JWT_SECRET!,
	natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
	internalApiKey: process.env.INTERNAL_API_KEY || 'dev-internal-key',
	wsGatewayHttpUrl: process.env.WS_GATEWAY_HTTP_URL || 'http://localhost:3004',

	/**
	 * Whether a notification may quote the message it announces.
	 *
	 * Off by default, and that default is a deliberate match for the rest of the
	 * system: messages are encrypted at rest (`MESSAGE_ENCRYPTION_KEY`), and a
	 * preview would hand their plaintext to Apple's servers and to anyone
	 * reading the lock screen. With it off the banner says who wrote, not what.
	 */
	includeMessagePreview: process.env.PUSH_MESSAGE_PREVIEW === 'true',

	/**
	 * APNs provider credentials. All four are required before a single push can
	 * be sent; with any of them missing the sender stays disabled and logs that
	 * it is dropping notifications, so the service runs normally in development
	 * long before anyone has an Apple Developer account.
	 *
	 * `keyPath` points at the `.p8` file downloaded from the Apple Developer
	 * portal — Keys → the key with APNs enabled. It is a private credential:
	 * mount it as a secret, never commit it.
	 */
	apns: {
		keyPath: process.env.APNS_KEY_PATH || '',
		keyId: process.env.APNS_KEY_ID || '',
		teamId: process.env.APNS_TEAM_ID || '',
		bundleId: process.env.APNS_BUNDLE_ID || '',
	},
};

export const apnsConfigured =
	!!config.apns.keyPath && !!config.apns.keyId && !!config.apns.teamId && !!config.apns.bundleId;
