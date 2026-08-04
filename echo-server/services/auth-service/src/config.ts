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
			// Matches OTP_TTL_MS in routes/auth.ts.
			ttlSeconds: 300,
		},
	},
};

function parseSmsDriver(value: string | undefined): 'log' | 'smsc' | 'telegram' | undefined {
	if (value === 'log' || value === 'smsc' || value === 'telegram') return value;
	if (value) throw new Error(`[auth-service] unknown SMS driver "${value}"`);
	return undefined;
}
