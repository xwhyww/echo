import { api } from '$lib/api/client.js';

/**
 * Device registration against push-service (`:3009`, behind the gateway).
 *
 * A token is an address, not a credential: the server pairs it with the signed-in
 * user from the auth header, which is why registering the same token again
 * simply moves it to whoever is signed in now.
 */

/** Which APNs world the token belongs to — reported by the native plugin. */
export type PushEnvironment = 'sandbox' | 'production';

/**
 * Idempotent by token, so calling it on every launch is free. That is also the
 * intended use: APNs rotates tokens on reinstall and restore-from-backup, and
 * re-reading is the only way to notice.
 */
export function registerDevice(token: string, environment: PushEnvironment): Promise<void> {
	return api('/push/devices', {
		method: 'POST',
		body: { token, platform: 'ios', environment },
	});
}

/**
 * Called on sign-out. Without it the phone keeps receiving notifications for an
 * account no longer signed in on it.
 */
export function unregisterDevice(token: string): Promise<void> {
	return api(`/push/devices/${encodeURIComponent(token)}`, { method: 'DELETE' });
}
