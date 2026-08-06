import { goBack } from '$lib/utils/navigation';

/** Travel that commits the gesture on its own, however slowly it was made. */
const DISTANCE_PX = 90;
/** A shorter drag still counts if it was flicked — px per ms. */
const FLICK_VELOCITY = 0.5;
const FLICK_MIN_PX = 48;
/** Past this the gesture is stale; a finger resting on the screen isn't a swipe. */
const MAX_DURATION_MS = 800;
/**
 * How much more horizontal than vertical the drag has to be. The gesture starts
 * anywhere on the screen now, so "mostly sideways" is not a strong enough claim
 * — a diagonal flick during a scroll would qualify.
 */
const HORIZONTAL_RATIO = 2;

/**
 * Things that own horizontal dragging themselves and must keep it.
 *
 * A slider is dragged sideways by definition; a canvas is being drawn on or
 * panned (the avatar cropper); `[data-no-swipe-back]` is the explicit opt-out
 * worn by the media carousel and the crop modal.
 */
const CLAIMS_HORIZONTAL = '[data-no-swipe-back], input[type="range"], canvas, [role="slider"]';

/**
 * Anything that can actually scroll sideways keeps its drag too — a chip row, a
 * wide table, a code block. Detected rather than tagged, so a scroller added
 * later is covered without anyone remembering this file.
 */
function inHorizontalScroller(target: Element): boolean {
	for (let el: Element | null = target; el; el = el.parentElement) {
		if (el.scrollWidth <= el.clientWidth + 1) continue;
		const overflow = getComputedStyle(el).overflowX;
		if (overflow === 'auto' || overflow === 'scroll') return true;
	}
	return false;
}

/**
 * The element the page is drawn on, which the gesture slides to show what it is
 * about to do. Declared by the root layout rather than found by class name, so
 * the two ends of the contract are visible from both sides.
 */
const SURFACE = '[data-swipe-surface]';
/**
 * How much of the finger's travel the page follows. Damped, because the commit
 * threshold is short: at 1:1 a 90px gesture would barely move and a cancelled
 * one would fling the page across the screen.
 */
const FOLLOW_RATIO = 0.5;
/** Past this the page stops following, so an over-long drag doesn't tear it off. */
const FOLLOW_MAX_PX = 140;
/** Long enough to read as "it snapped back", short enough not to feel stuck. */
const SETTLE_MS = 180;

/**
 * "Swipe right to go back", for touch only, from anywhere on the screen.
 *
 * Starting anywhere is the point, and it is also the whole difficulty: unlike
 * the iOS edge gesture this competes with every horizontal drag on the page
 * rather than sidestepping them. Three things keep it honest, and between them
 * they do the job the edge guard used to:
 *
 *   - it never begins on something that owns sideways dragging — a slider, a
 *     canvas, a real horizontal scroller, or anything wearing
 *     `data-no-swipe-back` (the media carousel, the avatar cropper);
 *   - the drag has to be `HORIZONTAL_RATIO` times more sideways than vertical,
 *     re-checked on every move, so a scroll that drifts right never converts;
 *   - it has to travel `DISTANCE_PX`, which is further than before, or be a
 *     deliberate flick.
 *
 * Listeners sit on the document rather than on a element, because the swipe
 * belongs to the whole page and the component mounting this (the header) only
 * occupies a strip at the top. They are passive: the gesture reads the finger
 * and never fights it, so a vertical scroll that starts at the edge still
 * scrolls, and the first vertical movement cancels the swipe outright.
 *
 * Mounted beside a back button — by `Header` on the ordinary pages, and by the
 * chat headers on the fullscreen chat surfaces, which render their own chrome
 * and so never get `Header`. The pairing is the rule: exactly the screens that
 * show a back button get the gesture, and it always leads where the button
 * does. It is deliberately not mounted by `BackButton` itself, because a page
 * may show two of them — `/chats/groups/[id]/media` does — and the gesture must
 * fire once.
 *
 * A null destination mounts nothing, which is how a screen with nothing behind
 * it (the chat list) opts out.
 */
export function useSwipeBack(backHref: () => string | null | undefined) {
	$effect(() => {
		// Typed as a plain string so the handlers below, which capture it, do not
		// have to re-prove it is non-null.
		const href: string = backHref() ?? '';
		if (!href) return;

		// Non-null only while a candidate gesture is in flight.
		let start: { id: number; x: number; y: number; at: number } | null = null;
		// Held for the length of one gesture: re-queried each time because the
		// page it belongs to is replaced on navigation.
		let surface: HTMLElement | null = null;

		/**
		 * Slide the page with the finger. This is the whole point of the
		 * animation — an accidental swipe announces itself while there is still
		 * time to drag back and cancel, instead of navigating out from under
		 * someone who meant to scroll.
		 */
		function follow(dx: number) {
			if (!surface) return;
			const shift = Math.min(dx * FOLLOW_RATIO, FOLLOW_MAX_PX);
			surface.style.transition = 'none';
			surface.style.transform = `translateX(${shift}px)`;
			// Past the point of no return the page dims a little, which is the
			// difference between "I am dragging" and "letting go goes back".
			surface.style.opacity = dx > DISTANCE_PX ? '0.72' : '1';
		}

		/** Undo everything `follow` did. Safe to call when it never ran. */
		function settle(animated: boolean) {
			const el = surface;
			surface = null;
			if (!el) return;
			el.style.transition = animated ? `transform ${SETTLE_MS}ms ease-out, opacity ${SETTLE_MS}ms ease-out` : 'none';
			el.style.transform = '';
			el.style.opacity = '';
			// Leaving a transition on the element would slow down whatever the
			// page does with it next.
			if (animated) {
				setTimeout(() => {
					el.style.transition = '';
				}, SETTLE_MS);
			} else {
				el.style.transition = '';
			}
		}

		function onPointerDown(e: PointerEvent) {
			start = null;
			if (e.pointerType !== 'touch' || !e.isPrimary) return;
			if (e.target instanceof Element) {
				if (e.target.closest(CLAIMS_HORIZONTAL)) return;
				if (inHorizontalScroller(e.target)) return;
			}
			start = { id: e.pointerId, x: e.clientX, y: e.clientY, at: e.timeStamp };
			surface = document.querySelector<HTMLElement>(SURFACE);
		}

		function onPointerMove(e: PointerEvent) {
			if (!start || e.pointerId !== start.id) return;
			const dx = e.clientX - start.x;
			const dy = e.clientY - start.y;
			// Nothing has been decided until the finger has actually moved;
			// judging direction from a jitter of a pixel or two throws away real
			// gestures.
			if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
			// A scroll is not allowed to become a back gesture halfway through,
			// and neither is a leftward drag that happens to end up right of
			// where it started.
			if (dx <= 0 || Math.abs(dx) < Math.abs(dy) * HORIZONTAL_RATIO) {
				start = null;
				settle(true);
				return;
			}
			follow(dx);
		}

		function onPointerUp(e: PointerEvent) {
			const from = start;
			start = null;
			if (!from || e.pointerId !== from.id) {
				settle(true);
				return;
			}

			const dx = e.clientX - from.x;
			const elapsed = e.timeStamp - from.at;
			const flicked = dx > FLICK_MIN_PX && dx / Math.max(elapsed, 1) > FLICK_VELOCITY;
			const commit = elapsed <= MAX_DURATION_MS && (dx > DISTANCE_PX || flicked);

			// Not animated on commit: the page is being replaced, and sliding it
			// home first would play the gesture backwards before the navigation
			// lands.
			settle(!commit);
			if (commit) goBack(href);
		}

		function onPointerCancel() {
			start = null;
			settle(true);
		}

		const opts = { passive: true } as const;
		document.addEventListener('pointerdown', onPointerDown, opts);
		document.addEventListener('pointermove', onPointerMove, opts);
		document.addEventListener('pointerup', onPointerUp, opts);
		document.addEventListener('pointercancel', onPointerCancel, opts);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('pointermove', onPointerMove);
			document.removeEventListener('pointerup', onPointerUp);
			document.removeEventListener('pointercancel', onPointerCancel);
			// Unmounting mid-gesture would otherwise leave the page shifted.
			settle(false);
		};
	});
}
