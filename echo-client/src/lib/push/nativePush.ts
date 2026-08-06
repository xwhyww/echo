import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '$lib/api/client.js';
import type { PushEnvironment } from '$lib/api/pushService.js';

/**
 * The native half of push notifications, which only exists on iOS.
 *
 * APNs is unreachable from the webview: asking for a token is a UIKit call, and
 * the token is delivered to the app delegate. This module is the whole surface
 * of that plugin — `usePushRegistration.svelte.ts` sits above it and never
 * learns where the token came from.
 *
 * Everywhere else the plugin's stub answers `false` from `requestPermission`,
 * which is where the hook stops. That is deliberate rather than a guard here:
 * the same build runs under `tauri ios dev` in a plain browser tab, where
 * sniffing the user agent would get it wrong.
 */

const PLUGIN = 'plugin:push|';

/** Prompts on first call; reports the stored answer silently afterwards. */
export function requestPushPermission(): Promise<boolean> {
	if (!isTauri) return Promise.resolve(false);
	return invoke<boolean>(PLUGIN + 'request_permission').catch(() => false);
}

/** Null until APNs has answered — normally within a second of registering. */
export function getPushToken(): Promise<string | null> {
	if (!isTauri) return Promise.resolve(null);
	return invoke<string | null>(PLUGIN + 'get_token').catch(() => null);
}

/**
 * Which APNs world this build's token belongs to. Read natively from the
 * `aps-environment` entitlement rather than from a debug flag — see the note in
 * PushPlugin.swift for why the obvious version is wrong.
 */
export function getPushEnvironment(): Promise<PushEnvironment> {
	if (!isTauri) return Promise.resolve('sandbox');
	return invoke<string>(PLUGIN + 'environment')
		.then((e) => (e === 'production' ? 'production' : 'sandbox'))
		.catch(() => 'sandbox' as const);
}
