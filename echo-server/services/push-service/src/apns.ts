import http2 from 'node:http2';
import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import { config, apnsConfigured } from './config.js';
import { log } from './log.js';

/**
 * A minimal APNs provider client.
 *
 * APNs is an HTTP/2 API: one long-lived connection carries every notification,
 * authenticated by a provider JWT in the `authorization` header rather than by
 * a per-request secret. There is no SDK here on purpose — the whole protocol is
 * one POST and a status code, and a hand-written client is less to keep current
 * than a dependency.
 *
 * Sandbox and production are *different hosts with different device tokens*, not
 * a flag: a token minted by a development build only exists in the sandbox. The
 * connection is therefore per-environment.
 */
const HOSTS = {
	sandbox: 'https://api.sandbox.push.apple.com',
	production: 'https://api.push.apple.com',
} as const;

export type ApnsEnvironment = keyof typeof HOSTS;

export interface ApnsNotification {
	title: string;
	body: string;
	/** Collapses earlier notifications with the same id — one banner per chat. */
	collapseId?: string;
	/** Delivered to the app as-is; this is how a tap knows where to navigate. */
	data?: Record<string, unknown>;
	threadId?: string;
}

/** What the caller has to act on: a token APNs says will never work again. */
export type ApnsResult =
	| { ok: true }
	| { ok: false; retryable: boolean; reason: string; unregistered: boolean };

const sessions = new Map<ApnsEnvironment, http2.ClientHttp2Session>();

function getSession(env: ApnsEnvironment): http2.ClientHttp2Session {
	const existing = sessions.get(env);
	if (existing && !existing.closed && !existing.destroyed) return existing;

	const session = http2.connect(HOSTS[env]);
	// A dropped connection is normal — APNs closes idle sessions, and the next
	// send simply opens a new one. Only the listener matters; without it an
	// error event on the session would take the process down.
	session.on('error', (err) => log.warn({ err, env }, 'APNs session error'));
	session.on('close', () => {
		if (sessions.get(env) === session) sessions.delete(env);
	});
	sessions.set(env, session);
	return session;
}

// The provider token is valid for an hour and Apple rejects clients that mint a
// fresh one per request, so it is cached and re-signed comfortably inside that
// window.
const TOKEN_TTL_MS = 50 * 60 * 1000;
let cachedToken: { value: string; mintedAt: number } | null = null;

function providerToken(): string {
	const now = Date.now();
	if (cachedToken && now - cachedToken.mintedAt < TOKEN_TTL_MS) return cachedToken.value;

	const key = readFileSync(config.apns.keyPath, 'utf8');
	const value = jwt.sign({ iss: config.apns.teamId, iat: Math.floor(now / 1000) }, key, {
		algorithm: 'ES256',
		header: { alg: 'ES256', kid: config.apns.keyId },
	});
	cachedToken = { value, mintedAt: now };
	return value;
}

export function isEnabled(): boolean {
	return apnsConfigured;
}

export async function sendApns(
	deviceToken: string,
	env: ApnsEnvironment,
	notification: ApnsNotification,
): Promise<ApnsResult> {
	if (!apnsConfigured) {
		return { ok: false, retryable: false, reason: 'apns-not-configured', unregistered: false };
	}

	const payload = JSON.stringify({
		aps: {
			alert: { title: notification.title, body: notification.body },
			sound: 'default',
			'thread-id': notification.threadId,
			'mutable-content': 1,
		},
		...notification.data,
	});

	const headers: Record<string, string> = {
		':method': 'POST',
		':path': `/3/device/${deviceToken}`,
		authorization: `bearer ${providerToken()}`,
		'apns-topic': config.apns.bundleId,
		'apns-push-type': 'alert',
		// 10 = deliver immediately. The alternative (5) lets iOS batch for power,
		// which is wrong for a message someone is waiting on.
		'apns-priority': '10',
	};
	if (notification.collapseId) headers['apns-collapse-id'] = notification.collapseId;

	return new Promise<ApnsResult>((resolve) => {
		let settled = false;
		const done = (r: ApnsResult) => {
			if (settled) return;
			settled = true;
			resolve(r);
		};

		let req: http2.ClientHttp2Stream;
		try {
			req = getSession(env).request(headers);
		} catch (err) {
			return done({ ok: false, retryable: true, reason: String(err), unregistered: false });
		}

		let status = 0;
		let body = '';
		req.on('response', (h) => {
			status = Number(h[':status']) || 0;
		});
		req.setEncoding('utf8');
		req.on('data', (chunk) => {
			body += chunk;
		});
		req.on('error', (err) =>
			done({ ok: false, retryable: true, reason: String(err), unregistered: false }),
		);
		req.on('end', () => {
			if (status === 200) return done({ ok: true });

			// APNs explains itself in a JSON `reason`. Two of them mean the token is
			// dead rather than the send being unlucky, and the caller deletes it:
			// 410 Unregistered (the app was removed) and BadDeviceToken (the token
			// belongs to the other environment, or was never valid).
			let reason = body;
			try {
				reason = (JSON.parse(body) as { reason?: string }).reason ?? body;
			} catch {
				/* non-JSON body — keep it raw for the log */
			}
			const unregistered = status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered';
			done({
				ok: false,
				// 429 and 5xx are APNs asking us to come back later; everything else
				// is our payload being wrong, and retrying would fail identically.
				retryable: status === 429 || status >= 500,
				reason,
				unregistered,
			});
		});

		req.end(payload);
	});
}

export function closeApns(): void {
	for (const session of sessions.values()) session.close();
	sessions.clear();
}
