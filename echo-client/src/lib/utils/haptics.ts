import { isTauri } from '$lib/api/client.js';

/**
 * The short tap you feel when a gesture is recognised — a long press opening a
 * message's menu, say.
 *
 * Native only, and not for want of trying on the web: WKWebView has no
 * `navigator.vibrate`, so on iOS this is the Taptic Engine or nothing. The
 * plugin is registered for mobile alone, so everywhere else these calls are
 * simply skipped.
 *
 * Failures never reach the caller — haptics are an embellishment, and a device
 * with the engine disabled, in Low Power Mode, or without one at all should
 * behave exactly as if the call had worked. They are logged rather than
 * discarded, though: swallowing them silently is what hid the plugin being
 * denied by a capability that granted nothing, which looks identical to a phone
 * that simply does not buzz.
 */
export function impact(style: 'light' | 'medium' | 'heavy' = 'medium'): void {
	if (!isTauri) return;
	void import('@tauri-apps/plugin-haptics')
		.then((h) => h.impactFeedback(style))
		.catch((e) => console.warn('[haptics] impact failed', e));
}
