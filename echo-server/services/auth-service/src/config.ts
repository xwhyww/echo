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
	// See sms.ts for what each driver needs. Defaults to `log` so a fresh clone
	// runs without any provider account.
	// Test accounts that sign in with a fixed code and never touch a provider.
	// Deliberately active in production too: the App Store and Play Store both
	// require a working demo login from reviewers who cannot receive an SMS on
	// our numbers, and end-to-end tests need an account they can drive.
	//
	// The trade-off is real and worth naming — the numbers are guessable and the
	// code is public, so these nine accounts are open to anyone who tries them.
	// They are throwaway by construction: never give one a password, and treat
	// anything in them as public. AUTH_TEST_ENABLED=false switches it off.
	//
	// That toggle is a separate variable from the list, rather than "set the
	// list to empty", because docker compose passes an unset variable through as
	// an empty string: under `${AUTH_TEST_PHONES:-}` there is no way to tell
	// "left alone" from "deliberately cleared", and either reading would
	// surprise somebody.
	testAuth: {
		enabled: process.env.AUTH_TEST_ENABLED !== 'false',
		phones: parseTestPhones(process.env.AUTH_TEST_PHONES),
		code: process.env.AUTH_TEST_CODE || '000000',
	},
	sms: {
		driver: parseSmsDriver(process.env.SMS_DRIVER) ?? 'log',
		fallbackDriver: parseSmsDriver(process.env.SMS_FALLBACK_DRIVER),
		// {code} is substituted with the digits. Only the SMS drivers use this —
		// Telegram Gateway renders its own wording.
		template: process.env.SMS_TEMPLATE || 'Echo code: {code}',
		smsc: {
			login: process.env.SMSC_LOGIN || '',
			password: process.env.SMSC_PASSWORD || '',
			// Registered alphanumeric sender name. Without one the operators
			// deliver from a shared shortcode, or reject the message outright.
			sender: process.env.SMSC_SENDER || '',
		},
		telegram: {
			token: process.env.TELEGRAM_GATEWAY_TOKEN || '',
			// Overridable because the gateway's IPv4 address is unreachable from
			// some networks (Russian hosting, notably) while its IPv6 answers
			// fine. Pointing this at a host-side relay reaches it over v6 without
			// giving containers an IPv6 stack — doing that at the Docker level
			// breaks the embedded DNS and takes every service down with it.
			// The host must still be the real one so TLS validates: relay via
			// `extra_hosts` + a non-443 port, not a different hostname.
			baseUrl: process.env.TELEGRAM_GATEWAY_BASE_URL || 'https://gatewayapi.telegram.org',
			// Matches OTP_TTL_MS in routes/auth.ts.
			ttlSeconds: 300,
		},
	},
};

// +7 followed by ten repeated digits. None of these is an assignable Russian
// mobile number — those start +79 and never repeat like this — so a real user
// can't collide with one.
const DEFAULT_TEST_PHONES = [
	'+71111111111',
	'+72222222222',
	'+73333333333',
	'+74444444444',
	'+75555555555',
	'+76666666666',
	'+77777777777',
	'+78888888888',
	'+79999999999',
];

// A Set because the only question ever asked of it is membership, on every
// sign-in request. Blank (unset, or empty via compose) means the defaults —
// AUTH_TEST_ENABLED is what turns the mechanism off.
function parseTestPhones(value: string | undefined): Set<string> {
	const list = (value ?? '')
		.split(',')
		.map((p) => p.trim())
		.filter(Boolean);
	return new Set(list.length > 0 ? list : DEFAULT_TEST_PHONES);
}

function parseSmsDriver(value: string | undefined): 'log' | 'smsc' | 'telegram' | undefined {
	if (value === 'log' || value === 'smsc' || value === 'telegram') return value;
	if (value) throw new Error(`[auth-service] unknown SMS driver "${value}"`);
	return undefined;
}
