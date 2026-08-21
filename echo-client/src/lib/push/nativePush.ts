import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '$lib/api/client.js';
import type { PushEnvironment, PushPlatform } from '$lib/api/pushService.js';

/**
 * The native half of push notifications: APNs on iOS, FCM on Android.
 *
 * Neither provider is reachable from the webview — on iOS asking for a token is
 * a UIKit call answered through the app delegate, and on Android it is a
 * Firebase task. This module is the whole surface of that plugin;
 * `usePushRegistration.svelte.ts` sits above it and never learns which provider
 * answered.
 *
 * On desktop the plugin's stub answers `false` from `requestPermission`, which
 * is where the hook stops. That is deliberate rather than a guard here: the same
 * build runs under `tauri ios dev` in a plain browser tab, where sniffing the
 * user agent would get it wrong.
 */

const PLUGIN = 'plugin:push|';

/** Prompts on first call; reports the stored answer silently afterwards. */
export function requestPushPermission(): Promise<boolean> {
	if (!isTauri) return Promise.resolve(false);
	return invoke<boolean>(PLUGIN + 'request_permission').catch(() => false);
}

/** Null until the provider has answered — normally within a second. */
export function getPushToken(): Promise<string | null> {
	if (!isTauri) return Promise.resolve(null);
	return invoke<string | null>(PLUGIN + 'get_token').catch(() => null);
}

/**
 * Which APNs world this build's token belongs to. Read natively from the
 * `aps-environment` entitlement rather than from a debug flag — see the note in
 * PushPlugin.swift for why the obvious version is wrong. Meaningless on Android,
 * which has no such split; the server ignores it for those rows.
 */
export function getPushEnvironment(): Promise<PushEnvironment> {
	if (!isTauri) return Promise.resolve('sandbox');
	return invoke<string>(PLUGIN + 'environment')
		.then((e) => (e === 'production' ? 'production' : 'sandbox'))
		.catch(() => 'sandbox' as const);
}

/**
 * Which provider the token came from, so the server knows whether to send it
 * through APNs or FCM.
 *
 * `other` is desktop, where the stub has already refused the permission and the
 * hook has stopped — it is here for completeness, not as a case to handle.
 */
export function getPushPlatform(): Promise<PushPlatform | 'other'> {
	if (!isTauri) return Promise.resolve('other');
	return invoke<string>(PLUGIN + 'platform')
		.then((p) => (p === 'ios' || p === 'android' ? p : ('other' as const)))
		.catch(() => 'other' as const);
}
