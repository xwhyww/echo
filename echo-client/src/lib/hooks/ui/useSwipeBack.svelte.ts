import { goBack } from '$lib/utils/navigation';

/** How far in from the left edge a swipe has to start to count as a back gesture. */
const EDGE_PX = 28;
/** Travel that commits the gesture on its own, however slowly it was made. */
const DISTANCE_PX = 80;
/** A shorter drag still counts if it was flicked — px per ms. */
const FLICK_VELOCITY = 0.5;
const FLICK_MIN_PX = 32;
/** Past this the gesture is stale; a finger resting on the edge isn't a swipe. */
const MAX_DURATION_MS = 800;

/**
 * iOS-style "swipe in from the left edge to go back", for touch only.
 *
 * The gesture has to start within `EDGE_PX` of the left edge. That guard is what
 * keeps it from stealing horizontal drags the page wants for itself — the media
 * carousel, a scrolling row of chips, drag-to-reorder — none of which begin at
 * the very edge of the screen. Anything that still needs to opt out can wear
 * `data-no-swipe-back`.
 *
 * Listeners sit on the document rather than on a element, because the swipe
 * belongs to the whole page and the component mounting this (the header) only
 * occupies a strip at the top. They are passive: the gesture reads the finger
 * and never fights it, so a vertical scroll that starts at the edge still
 * scrolls, and the first vertical movement cancels the swipe outright.
 *
 * Mounted by `Header`, so exactly the pages that show a back button get the
 * gesture, and it always leads to the same place the button does.
 */
export function useSwipeBack(backHref: () => string) {
	$effect(() => {
		// Non-null only while a candidate gesture is in flight.
		let start: { id: number; x: number; y: number; at: number } | null = null;

		function onPointerDown(e: PointerEvent) {
			start = null;
			if (e.pointerType !== 'touch' || !e.isPrimary) return;
			if (e.clientX > EDGE_PX) return;
			if (e.target instanceof Element && e.target.closest('[data-no-swipe-back]')) return;
			start = { id: e.pointerId, x: e.clientX, y: e.clientY, at: e.timeStamp };
		}

		function onPointerMove(e: PointerEvent) {
			if (!start || e.pointerId !== start.id) return;
			// The first movement decides what the finger is doing. Anything with
			// more vertical than horizontal in it is a scroll, and a scroll is not
			// allowed to turn into a back gesture halfway through.
			const dx = e.clientX - start.x;
			const dy = e.clientY - start.y;
			if (Math.abs(dy) > Math.abs(dx)) start = null;
		}

		function onPointerUp(e: PointerEvent) {
			const from = start;
			start = null;
			if (!from || e.pointerId !== from.id) return;

			const dx = e.clientX - from.x;
			const elapsed = e.timeStamp - from.at;
			if (elapsed > MAX_DURATION_MS) return;

			const flicked = dx > FLICK_MIN_PX && dx / Math.max(elapsed, 1) > FLICK_VELOCITY;
			if (dx > DISTANCE_PX || flicked) goBack(backHref());
		}

		function onPointerCancel() {
			start = null;
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
		};
	});
}
