import { config } from './config.js';
import { log } from './log.js';

// Delivery of the 6-digit sign-in code. The code itself is the unit of work
// rather than a finished string, because Telegram Gateway takes the digits as
// a field and renders its own message — only the SMS drivers build text.
//
// Drivers:
//   log       — prints the code to the service log (dev; no provider needed)
//   smsc      — SMSC.ru, for +7 numbers. Requires a contract and a sender name
//               registered with the operators before it will deliver.
//   telegram  — Telegram Gateway (gatewayapi.telegram.org). Far cheaper than
//               SMS and needs no sender registration, but only reaches numbers
//               that have a Telegram account.
//
// SMS_FALLBACK_DRIVER runs when the primary fails, which is the point of the
// telegram→smsc pairing: most users get the cheap path, the rest still get in.
export type SmsDriver = 'log' | 'smsc' | 'telegram';

function driverError(driver: SmsDriver, message: string): Error {
	return Object.assign(new Error(message), { driver });
}

async function sendViaLog(phone: string, code: string): Promise<void> {
	// Deliberately interpolated into the message rather than passed as a field:
	// field names like `smsCode` are redacted by the shared logger, and the
	// whole purpose of this driver is to make the code readable in dev.
	log.info({ phone }, `verification code ${code}`);
}

// https://smsc.ru/api/http/ — fmt=3 asks for a JSON response. A failure comes
// back as HTTP 200 with an `error` field, so the status code alone proves
// nothing.
async function sendViaSmsc(phone: string, code: string): Promise<void> {
	const { login, password, sender } = config.sms.smsc;
	if (!login || !password) {
		throw driverError('smsc', 'SMSC_LOGIN and SMSC_PASSWORD are required for SMS_DRIVER=smsc');
	}

	const params = new URLSearchParams({
		login,
		psw: password,
		phones: phone,
		mes: config.sms.template.replace('{code}', code),
		fmt: '3',
		charset: 'utf-8',
	});
	if (sender) params.set('sender', sender);

	const resp = await fetch('https://smsc.ru/sys/send.php', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: params,
		signal: AbortSignal.timeout(10_000),
	});
	if (!resp.ok) {
		throw driverError('smsc', `smsc.ru returned HTTP ${resp.status}`);
	}

	const data = (await resp.json()) as { id?: number; cnt?: number; error?: string; error_code?: number };
	if (data.error) {
		throw driverError('smsc', `smsc.ru error ${data.error_code}: ${data.error}`);
	}
	log.info({ phone, messageId: data.id, parts: data.cnt }, 'sms sent via smsc');
}

// https://core.telegram.org/gateway/api — the gateway renders the verification
// message itself, so there is no text to build. `ttl` matches the OTP lifetime
// in auth.ts so an expired code stops being displayed.
async function sendViaTelegram(phone: string, code: string): Promise<void> {
	const { token, ttlSeconds, baseUrl } = config.sms.telegram;
	if (!token) {
		throw driverError('telegram', 'TELEGRAM_GATEWAY_TOKEN is required for SMS_DRIVER=telegram');
	}

	const resp = await fetch(`${baseUrl}/sendVerificationMessage`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ phone_number: phone, code, ttl: ttlSeconds }),
		signal: AbortSignal.timeout(10_000),
	});

	const data = (await resp.json().catch(() => ({}))) as {
		ok?: boolean;
		error?: string;
		result?: { request_id?: string; delivery_status?: { status?: string } };
	};
	if (!resp.ok || !data.ok) {
		// The common failures are FLOOD_WAIT, PHONE_NUMBER_INVALID, and the number
		// simply having no Telegram account — all of which should fall through to
		// the SMS driver rather than fail the request.
		throw driverError('telegram', data.error || `telegram gateway returned HTTP ${resp.status}`);
	}
	log.info(
		{ phone, requestId: data.result?.request_id, status: data.result?.delivery_status?.status },
		'code sent via telegram gateway',
	);
}

const DRIVERS: Record<SmsDriver, (phone: string, code: string) => Promise<void>> = {
	log: sendViaLog,
	smsc: sendViaSmsc,
	telegram: sendViaTelegram,
};

if (config.sms.driver === 'log' && process.env.NODE_ENV === 'production') {
	log.warn('SMS_DRIVER=log in production — verification codes are being written to the log');
}

/**
 * Deliver a verification code. Throws only once every configured driver has
 * failed; the caller turns that into a "could not send, try again" response.
 */
export async function sendVerificationCode(phone: string, code: string): Promise<void> {
	const { driver, fallbackDriver } = config.sms;
	try {
		await DRIVERS[driver](phone, code);
		return;
	} catch (err) {
		if (!fallbackDriver) throw err;
		log.warn({ err, driver, fallbackDriver }, 'primary sms driver failed, trying fallback');
		await DRIVERS[fallbackDriver](phone, code);
	}
}
