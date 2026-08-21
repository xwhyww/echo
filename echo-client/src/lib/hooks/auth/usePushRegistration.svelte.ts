import { auth } from '$lib/stores/auth.svelte.js';
import { registerDevice } from '$lib/api/pushService.js';
import {
	getPushEnvironment,
	getPushPlatform,
	getPushToken,
	requestPushPermission,
} from '$lib/push/nativePush.js';

/**
 * Registers this install for push once the user is signed in.
 *
 * Mounted once from the root layout, beside `useAuthGuard()`. It runs on every
 * launch rather than only the first: both APNs and FCM rotate tokens — on
 * reinstall, on restore-from-backup and occasionally on their own — and
 * re-reading is the only way to notice. The endpoint upserts on the token, so
 * repeating it is free.
 *
 * Nothing here is fatal. A declined prompt, a platform without the plugin, or a
 * server that is down all end the same way — no registration, and the app is
 * otherwise unaffected.
 */

/// The token arrives asynchronously from the provider, so `get_token` is a poll
/// rather than a question with an immediate answer. Roughly five seconds in total,
/// which is generous for a call that normally lands on the first or second try.
const TOKEN_POLL_ATTEMPTS = 10;
const TOKEN_POLL_INTERVAL_MS = 500;

async function readToken(): Promise<string | null> {
	for (let i = 0; i < TOKEN_POLL_ATTEMPTS; i++) {
		const token = await getPushToken();
		if (token) return token;
		await new Promise((r) => setTimeout(r, TOKEN_POLL_INTERVAL_MS));
	}
	return null;
}

export function usePushRegistration() {
	// Tracked outside the effect so a re-run — a sign-out and back in, say —
	// does not re-register a token that is already on file for this session.
	let registeredFor: string | null = null;

	$effect(() => {
		const userId = auth.user?.id ?? null;
		if (!userId || registeredFor === userId) return;

		let cancelled = false;

		void (async () => {
			const granted = await requestPushPermission();
			if (cancelled || !granted) return;

			const token = await readToken();
			if (cancelled || !token) return;

			const [environment, platform] = await Promise.all([
				getPushEnvironment(),
				getPushPlatform(),
			]);
			if (cancelled) return;
			// Only reachable on a platform whose plugin granted the permission, so
			// `other` here would mean the stub said yes — it does not.
			if (platform === 'other') return;

			try {
				await registerDevice(token, environment, platform);
				auth.pushToken = token;
				registeredFor = userId;
			} catch {
				// Left unregistered on purpose: the next launch tries again, and
				// there is nothing the user could do about it here.
			}
		})();

		return () => {
			cancelled = true;
		};
	});
}
