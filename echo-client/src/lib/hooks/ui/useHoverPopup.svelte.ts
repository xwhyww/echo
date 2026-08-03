/** Where a flyout hangs off its trigger, in viewport coordinates. */
export type PopupAnchor = { top: number; left: number; right: number };

/** Grace period so the pointer can cross the gap from item to flyout. */
const HIDE_DELAY = 120;

/**
 * A menu item that opens a flyout on hover. Owns the trigger element, the
 * anchor measured off it, and the close delay — the caller decides which side
 * the flyout flies out to, since only it knows the surrounding layout.
 */
export function useHoverPopup<T extends HTMLElement = HTMLElement>() {
	let el = $state<T | undefined>();
	let anchor = $state<PopupAnchor | null>(null);
	let open = $state(false);
	let hideTimer: ReturnType<typeof setTimeout> | null = null;

	function clearHide() {
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
	}

	function show() {
		clearHide();
		if (!el) return;
		const rect = el.getBoundingClientRect();
		// `left` opens rightwards off the item's right edge; `right` is the
		// item's left edge, for when the flyout has to open the other way.
		anchor = { top: rect.top, left: rect.right, right: rect.left };
		open = true;
	}

	function hide() {
		clearHide();
		hideTimer = setTimeout(() => (open = false), HIDE_DELAY);
	}

	/** Immediate, for when the whole menu goes away. */
	function close() {
		clearHide();
		open = false;
		anchor = null;
	}

	return {
		get el() {
			return el;
		},
		set el(v: T | undefined) {
			el = v;
		},
		get anchor() {
			return anchor;
		},
		get open() {
			return open;
		},
		show,
		hide,
		close,
	};
}
