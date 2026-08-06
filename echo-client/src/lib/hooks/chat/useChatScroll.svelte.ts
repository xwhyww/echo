/** Below this many pixels from the end, the view counts as pinned to the bottom. */
const BOTTOM_THRESHOLD = 30;
/** How long to keep forcing the scroll down while late media lays itself out. */
const STICK_MS = 2000;
/** How close to the top before the previous page is worth fetching. */
const TOP_THRESHOLD = 100;
/** How close to the end before the next page is, for surfaces that page both ways. */
const NEAR_BOTTOM_THRESHOLD = 300;
/** How long a jumped-to message keeps its highlight. */
const FLASH_MS = 1600;

/**
 * A message list's scroll behaviour: whether we're following the conversation,
 * getting back to the bottom and staying there while images settle, holding
 * position when older messages are prepended, and jumping to one message.
 *
 * All of it is about the same scroller element, and none of it is about what
 * the messages are — which is why it isn't part of the panel it serves.
 */
export function useChatScroll(
	options: {
		onReachTop?: () => void;
		/**
		 * Only for surfaces that can be scrolled *into* — one showing history
		 * around a jumped-to message has newer messages below to fetch too.
		 */
		onNearBottom?: () => void;
	} = {},
) {
	let element = $state<HTMLElement | null>(null);
	let pinnedToBottom = $state(true);

	// Read inside callbacks, never rendered.
	let distanceFromBottom = 0;
	let stickUntil = 0;
	let stickObserver: ResizeObserver | null = null;

	function stick() {
		if (element && pinnedToBottom) element.scrollTop = element.scrollHeight;
	}

	$effect(() => () => {
		stickObserver?.disconnect();
		stickObserver = null;
	});

	return {
		get element() { return element; },
		set element(el: HTMLElement | null) { element = el; },
		get pinnedToBottom() { return pinnedToBottom; },
		// Settable because loading a different window of the conversation decides
		// this without any scrolling having happened.
		set pinnedToBottom(v: boolean) { pinnedToBottom = v; },
		/** Pixels between the viewport's end and the list's — for the warm cache. */
		get distanceFromBottom() { return distanceFromBottom; },

		onScroll() {
			const el = element;
			if (!el) return;
			distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
			pinnedToBottom = distanceFromBottom < BOTTOM_THRESHOLD;
			if (el.scrollTop < TOP_THRESHOLD) options.onReachTop?.();
			if (distanceFromBottom < NEAR_BOTTOM_THRESHOLD) options.onNearBottom?.();
		},

		toBottom() {
			requestAnimationFrame(() => {
				const el = element;
				if (!el) return;
				el.scrollTop = el.scrollHeight;
				pinnedToBottom = true;

				// Images and videos resolve their height after we've already
				// scrolled, which would leave the newest message above the fold.
				// Hold the bottom for a couple of seconds, and again as each one
				// reports in.
				stickUntil = performance.now() + STICK_MS;
				if (!stickObserver && typeof ResizeObserver !== 'undefined') {
					stickObserver = new ResizeObserver(() => {
						if (performance.now() < stickUntil) stick();
					});
					stickObserver.observe(el);
				}

				for (const media of el.querySelectorAll('img, video')) {
					if (media instanceof HTMLImageElement && !media.complete) {
						media.addEventListener('load', stick, { once: true });
					} else if (media instanceof HTMLVideoElement && media.readyState < 1) {
						media.addEventListener('loadedmetadata', stick, { once: true });
					}
				}
			});
		},

		/** Put the view back where a cached conversation was left. */
		restoreDistanceFromBottom(px: number) {
			const el = element;
			if (!el) return;
			pinnedToBottom = false;
			el.scrollTop = el.scrollHeight - el.clientHeight - px;
		},

		/**
		 * Prepending older messages shoves the view down by their height. Called
		 * with the id of the row that was on top beforehand, this puts that row
		 * back where it was on screen.
		 */
		restoreAnchor(anchorId: string | undefined) {
			if (!anchorId) return;
			requestAnimationFrame(() => {
				const el = element;
				const anchor = el?.querySelector(`[data-msg-id="${anchorId}"]`);
				if (!el || !anchor) return;
				el.scrollTop += anchor.getBoundingClientRect().top - el.getBoundingClientRect().top;
			});
		},

		/**
		 * Centre one message and flash it. Returns false when that row isn't
		 * rendered — what to do then is the caller's business: one surface says so,
		 * another fetches the window around it.
		 */
		jumpTo(messageId: string): boolean {
			const el = element;
			if (!el) return false;
			const row = el.querySelector(`[data-msg-id="${messageId}"]`) as HTMLElement | null;
			if (!row) return false;
			const view = el.getBoundingClientRect();
			const rect = row.getBoundingClientRect();
			el.scrollTop += rect.top - view.top - (view.height / 2 - rect.height / 2);
			row.classList.add('highlight-flash');
			setTimeout(() => row.classList.remove('highlight-flash'), FLASH_MS);
			return true;
		},
	};
}
