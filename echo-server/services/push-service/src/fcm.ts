import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import { config, fcmConfigured } from './config.js';
import type { ApnsNotification } from './apns.js';
import { log } from './log.js';

/**
 * A minimal FCM HTTP v1 client — the Android half of `apns.ts`.
 *
 * No `firebase-admin` here, for the same reason there is no APNs SDK: the whole
 * protocol is an OAuth2 token exchange and one POST, and the SDK would pull in a
 * large dependency tree to hide four dozen lines.
 *
 * The legacy `fcm.googleapis.com/fcm/send` API — the one with a static server
 * key that most examples still show — was turned off in 2024. v1 authenticates
 * with a short-lived access token minted from a service-account key, which is
 * why there is a token cache below.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

interface ServiceAccount {
	project_id: string;
	client_email: string;
	private_key: string;
}

export type FcmResult =
	| { ok: true }
	| { ok: false; retryable: boolean; reason: string; unregistered: boolean };

let account: ServiceAccount | null = null;
let accountLoadFailed = false;

function serviceAccount(): ServiceAccount | null {
	if (account) return account;
	// One failed read is enough — the path is not going to start existing, and
	// retrying it on every notification would spam the log.
	if (accountLoadFailed) return null;
	try {
		const parsed = JSON.parse(
			readFileSync(config.fcm.serviceAccountPath, 'utf8'),
		) as ServiceAccount;
		if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
			throw new Error('service account JSON is missing project_id, client_email or private_key');
		}
		account = parsed;
		return account;
	} catch (err) {
		accountLoadFailed = true;
		log.error({ err, path: config.fcm.serviceAccountPath }, 'could not read FCM service account');
		return null;
	}
}

// Google issues access tokens for an hour. Cached well inside that, and re-minted
// rather than refreshed — the assertion flow has no refresh token.
const TOKEN_TTL_MS = 50 * 60 * 1000;
let cachedToken: { value: string; mintedAt: number } | null = null;

async function accessToken(): Promise<string | null> {
	const now = Date.now();
	if (cachedToken && now - cachedToken.mintedAt < TOKEN_TTL_MS) return cachedToken.value;

	const sa = serviceAccount();
	if (!sa) return null;

	const iat = Math.floor(now / 1000);
	const assertion = jwt.sign(
		{
			iss: sa.client_email,
			scope: SCOPE,
			aud: TOKEN_URL,
			iat,
			exp: iat + 3600,
		},
		sa.private_key,
		{ algorithm: 'RS256' },
	);

	const res = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			assertion,
		}),
	});

	if (!res.ok) {
		log.error({ status: res.status, body: await res.text() }, 'FCM token exchange failed');
		return null;
	}

	const { access_token } = (await res.json()) as { access_token?: string };
	if (!access_token) return null;

	cachedToken = { value: access_token, mintedAt: now };
	return access_token;
}

export function isFcmEnabled(): boolean {
	return fcmConfigured;
}

export async function sendFcm(
	deviceToken: string,
	notification: ApnsNotification,
): Promise<FcmResult> {
	if (!fcmConfigured) {
		return { ok: false, retryable: false, reason: 'fcm-not-configured', unregistered: false };
	}

	const token = await accessToken();
	const sa = serviceAccount();
	if (!token || !sa) {
		return { ok: false, retryable: true, reason: 'no-access-token', unregistered: false };
	}

	// `data` values must all be strings — FCM rejects the request outright
	// otherwise, and the failure is a 400 that says very little about which key
	// was at fault.
	const data: Record<string, string> = {};
	for (const [key, value] of Object.entries(notification.data ?? {})) {
		data[key] = typeof value === 'string' ? value : JSON.stringify(value);
	}

	const message = {
		token: deviceToken,
		notification: { title: notification.title, body: notification.body },
		data,
		android: {
			// The Android counterpart of apns-priority 10: deliver now rather than
			// waiting for the device to come out of doze.
			priority: 'HIGH' as const,
			notification: {
				sound: 'default',
				// Same role as apns-collapse-id — twenty messages from one chat
				// replace each other instead of stacking twenty banners.
				tag: notification.collapseId,
			},
			...(notification.collapseId ? { collapse_key: notification.collapseId } : {}),
		},
	};

	let res: Response;
	try {
		res = await fetch(
			`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ message }),
			},
		);
	} catch (err) {
		return { ok: false, retryable: true, reason: String(err), unregistered: false };
	}

	if (res.ok) return { ok: true };

	const body = await res.text();
	let reason = body;
	try {
		reason =
			(JSON.parse(body) as { error?: { status?: string; message?: string } }).error?.status ??
			body;
	} catch {
		/* non-JSON body — keep it raw for the log */
	}

	// UNREGISTERED means the app was uninstalled or the token rotated; INVALID_ARGUMENT
	// on a send is almost always a malformed token. Both are permanent for this
	// token, and the caller deletes it rather than retrying forever.
	const unregistered =
		res.status === 404 || reason === 'UNREGISTERED' || reason === 'NOT_FOUND';

	// A stale access token shows up as 401. Dropping the cache means the next
	// attempt mints a fresh one instead of repeating the failure.
	if (res.status === 401) cachedToken = null;

	return {
		ok: false,
		retryable: res.status === 401 || res.status === 429 || res.status >= 500,
		reason,
		unregistered,
	};
}
