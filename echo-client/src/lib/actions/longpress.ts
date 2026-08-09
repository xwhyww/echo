import type { Action } from 'svelte/action';

export interface LongPressDetail {
	x: number;
	y: number;
	pointerType: string;
	/** The element actually under the pointer, not the node the action is on. */
	target: HTMLElement | null;
}

export interface LongPressOptions {
	onlongpress: (detail: LongPressDetail) => void;
	/** Checked at press time, so it always sees current state. */
	enabled?: () => boolean;
}

/**
 * Set on the node for as long as a press is being watched, and removed the
 * moment it is abandoned or fires. It exists so a component can show that the
 * hold has been noticed — the bubble shrinking under the finger — in CSS, with
 * no state to plumb through the component that happens to own the gesture.
 */
const PRESSING_ATTR = 'data-pressing';

/**
 * Hold thresholds. Touch uses the platform-conventional 500ms. A mouse button
 * held still is much more likely to be an abandoned drag or a pause mid-click,
 * so it waits a full second before committing.
 */
const HOLD_MS: Record<string, number> = { touch: 500, pen: 500, mouse: 1000 };
const DEFAULT_HOLD_MS = 500;

/** Movement past this many pixels means the user is dragging or scrolling. */
const MOVE_SLOP = 10;

/** How long to keep watching for the trailing click/contextmenu after firing. */
const SWALLOW_WINDOW_MS = 700;

/**
 * Fires `onlongpress` when a pointer is held still on the node past the
 * threshold for its input type — the touch equivalent of a right click.
 *
 * After firing it swallows the events the same gesture trails behind it: the
 * click, and the native contextmenu that some platforms (Android Chrome) also
 * raise off a long press. Those listeners go on the window rather than the
 * node, because by the time the click is dispatched the handler has usually
 * opened an overlay that now sits under the pointer and would otherwise
 * receive the click and immediately dismiss itself.
 */
export const longpress: Action<HTMLElement, LongPressOptions> = (node, params) => {
	let opts = params;
	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	let swallowTimer: ReturnType<typeof setTimeout> | null = null;
	let startX = 0;
	let startY = 0;

	function stopTracking() {
		node.removeAttribute(PRESSING_ATTR);
		if (holdTimer !== null) {
			clearTimeout(holdTimer);
			holdTimer = null;
		}
		window.removeEventListener('pointermove', onMove, true);
		window.removeEventListener('pointerup', stopTracking, true);
		window.removeEventListener('pointercancel', stopTracking, true);
		window.removeEventListener('scroll', stopTracking, true);
	}

	function swallow(e: Event) {
		e.preventDefault();
		e.stopPropagation();
		if (e.type === 'click') disarmSwallow();
	}

	function armSwallow() {
		disarmSwallow();
		window.addEventListener('click', swallow, true);
		window.addEventListener('contextmenu', swallow, true);
		// The click we want to eat belongs to the gesture that just fired, so it
		// arrives with no pointerdown ahead of it. A fresh press — the user
		// reaching for the menu that just opened — starts with one, and must not
		// be swallowed however quickly it follows.
		window.addEventListener('pointerdown', disarmSwallow, true);
		// Touch often dispatches no click at all after a long press, so this
		// can't rely on one arriving to disarm itself.
		swallowTimer = setTimeout(disarmSwallow, SWALLOW_WINDOW_MS);
	}

	function disarmSwallow() {
		if (swallowTimer !== null) {
			clearTimeout(swallowTimer);
			swallowTimer = null;
		}
		window.removeEventListener('click', swallow, true);
		window.removeEventListener('contextmenu', swallow, true);
		window.removeEventListener('pointerdown', disarmSwallow, true);
	}

	function onDown(e: PointerEvent) {
		// Primary button only; a real right click already opens the menu.
		if (e.button !== 0) return;
		if (opts.enabled && !opts.enabled()) return;

		stopTracking();
		disarmSwallow();
		startX = e.clientX;
		startY = e.clientY;
		const target = e.target as HTMLElement | null;
		const pointerType = e.pointerType;

		window.addEventListener('pointermove', onMove, true);
		window.addEventListener('pointerup', stopTracking, true);
		window.addEventListener('pointercancel', stopTracking, true);
		window.addEventListener('scroll', stopTracking, true);

		// Touch only. A mouse cursor resting on something is not a gesture the
		// user is committing to, and shrinking the element under it would read as
		// a bug rather than as feedback.
		if (pointerType === 'touch' || pointerType === 'pen') {
			node.setAttribute(PRESSING_ATTR, '');
		}

		holdTimer = setTimeout(() => {
			holdTimer = null;
			// Clears the pressing state, so the element is back to full size by the
			// time the menu is over it.
			stopTracking();
			armSwallow();
			opts.onlongpress({ x: startX, y: startY, pointerType, target });
		}, HOLD_MS[pointerType] ?? DEFAULT_HOLD_MS);
	}

	function onMove(e: PointerEvent) {
		if (Math.abs(e.clientX - startX) > MOVE_SLOP || Math.abs(e.clientY - startY) > MOVE_SLOP) {
			stopTracking();
		}
	}

	node.addEventListener('pointerdown', onDown);

	return {
		update(next: LongPressOptions) {
			opts = next;
		},
		destroy() {
			stopTracking();
			disarmSwallow();
			node.removeEventListener('pointerdown', onDown);
		},
	};
};
