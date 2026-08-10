import { auth } from '$lib/stores/auth.svelte.js';
import { personalChatsStore } from '$lib/stores/personalChats.svelte.js';

/**
 * Takes down the black cover `app.html` paints over the app at startup.
 *
 * The cover exists because the first frame of a cold start is unstyled markup:
 * the CSS, the webfont and the background image all arrive after the document
 * does, so without it the app opens on white, jumps to its real layout, and
 * fills its background last. Holding a black screen over that and fading out is
 * the difference between "loading" and "broken".
 */

/** Matches the transition in `app.html`; the node is removed once it has run. */
const FADE_MS = 200;
/**
 * Longest the cover will wait for everything below. A slow network, a failed
 * request or a missing font must cost the app a few seconds, never strand it
 * behind a black screen — so this is a ceiling on the whole wait, not on any
 * one part of it.
 */
const MAX_WAIT_MS = 5000;
/**
 * And the least it will stay. Without a floor the cover can come and go inside
 * a single frame on a warm start — which is the flash it was added to prevent,
 * just black instead of white.
 */
const MIN_SHOW_MS = 250;

/** The one the app shell paints; decoding it is the slowest part of a cold start. */
const BACKDROP = '/chat-bg/chat-bg-1.jpg';

function backdropReady(): Promise<void> {
	return new Promise((resolve) => {
		const image = new Image();
		image.onload = () => resolve();
		image.onerror = () => resolve();
		image.src = BACKDROP;
		// A cached image can already be complete before the handlers are attached.
		if (image.complete) resolve();
	});
}

/** Two frames: one to apply whatever just resolved, one to paint it. */
function painted(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
	});
}

/**
 * The chat list, which is what the app opens on and the last thing to arrive:
 * it needs the session restored and a round trip to the server, so revealing
 * before it lands means showing an empty list that fills in a moment later.
 *
 * Signed out there is nothing to fetch and the login screen is the destination,
 * so this resolves immediately. A failed request resolves too — the cover is
 * not the place to handle it, and the list shows its own error.
 */
async function chatsReady(): Promise<void> {
	await auth.ready;
	if (!auth.isAuthenticated) return;
	// Idempotent and shared: whoever gets here first starts the one fetch, and
	// the sidebar awaits the same promise when it mounts.
	await personalChatsStore.ensureLoaded().catch(() => {});
}

export function useBootCover() {
	$effect(() => {
		const cover = document.getElementById('boot-cover');
		if (!cover) return;

		let done = false;
		const started = performance.now();

		function reveal() {
			if (done) return;
			done = true;
			cover!.classList.add('hidden');
			// Removed rather than left at opacity 0: it covers the whole screen,
			// and a transparent lid still costs a composited layer every frame.
			setTimeout(() => cover!.remove(), FADE_MS);
		}

		void (async () => {
			// Fonts as well as the image: text reflowing from the fallback face to
			// Inter is most of what "unstyled" looks like, and it lands well after
			// the stylesheet does. `document.fonts.ready` covers the whole set.
			await Promise.all([
				backdropReady(),
				document.fonts?.ready ?? Promise.resolve(),
				chatsReady(),
			]);
			// Resolved is not the same as drawn — without this the cover lifts on
			// the frame before the first styled one.
			await painted();
			const elapsed = performance.now() - started;
			if (elapsed < MIN_SHOW_MS) {
				setTimeout(reveal, MIN_SHOW_MS - elapsed);
				return;
			}
			reveal();
		})();

		const timeout = setTimeout(reveal, MAX_WAIT_MS);

		return () => {
			clearTimeout(timeout);
			// Whatever happens to this effect, the app must not be left under it.
			reveal();
		};
	});
}
