import { addPluginListener, invoke, type PluginListener } from '@tauri-apps/api/core';
import { isTauri } from '$lib/api/client.js';

/**
 * The native half of screen sharing, which only exists on iOS.
 *
 * iOS has no `getDisplayMedia`. The system captures the screen through a
 * ReplayKit Broadcast Upload Extension, which writes frames into an App Group
 * container that only native code can read — the webview's WebRTC stack is in a
 * sealed process and cannot be handed a track. So the share is published by a
 * second, native LiveKit connection: see `$lib/utils/voiceIdentity.ts` for why
 * it joins under its own identity.
 *
 * This module is the whole surface of that plugin. Everything above it
 * (`screenShare.svelte.ts`) treats sharing as one operation and never learns
 * which mechanism carried it.
 */

const PLUGIN = 'plugin:screenshare|';

/**
 * Whether the native path exists here.
 *
 * Cached because it cannot change within a session, and probed by asking the
 * plugin rather than by sniffing the user agent: the same iOS build can run
 * under `tauri ios dev` in a plain browser tab, where the plugin isn't there
 * and the web path is the right one.
 */
let supported: Promise<boolean> | null = null;

export function isNativeScreenShareSupported(): Promise<boolean> {
	if (!isTauri) return Promise.resolve(false);
	supported ??= invoke<boolean>(PLUGIN + 'is_supported').catch(() => false);
	return supported;
}

/**
 * Connect the sidecar and raise the system broadcast sheet.
 *
 * Resolves once the user has confirmed the sheet and frames are flowing, so a
 * caller can treat a clean return as "we are sharing". Rejects with
 * `cancelled` when they dismiss it — the caller maps that to a no-op the same
 * way the web path treats a dismissed picker.
 */
export function startNativeScreenShare(url: string, token: string): Promise<void> {
	return invoke(PLUGIN + 'start', { url, token });
}

/** Idempotent: safe to call when nothing is sharing. */
export function stopNativeScreenShare(): Promise<void> {
	return invoke(PLUGIN + 'stop');
}

/**
 * Mute the captured app audio. The sidecar owns that publication, so unlike the
 * web path this cannot be done from our own room. No-op when the broadcast
 * carries no audio track.
 */
export function setNativeScreenShareAudioMuted(muted: boolean): Promise<void> {
	return invoke(PLUGIN + 'set_audio_muted', { muted });
}

/**
 * Fires when the broadcast ends without us asking — the user hit Stop in
 * Control Center or the status bar, or the extension was killed. The web path's
 * equivalent is the `ended` event on the display-capture track.
 */
export function onNativeScreenShareEnded(handler: () => void): Promise<PluginListener> {
	return addPluginListener('screenshare', 'ended', () => handler());
}
