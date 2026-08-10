import { afterNavigate } from '$app/navigation';
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
/**
 * How sideways the drag has to be to count as a swipe: `|dx| >= |dy| * ratio`.
 *
 * Below 1 the benefit of the doubt goes to the swipe — a diagonal at 45°, and
 * anything up to roughly 51°, is taken as "back" rather than as a scroll. Only a
 * drag that is clearly more up-and-down than sideways is left to the scroller,
 * which is the way round people actually gesture: a back swipe wanders, a scroll
 * does not.
 */
const HORIZONTAL_RATIO = 0.8;

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
 * How much of the finger's travel the page follows. 1:1 — the page goes exactly
 * where the finger goes, which is what makes it read as being dragged aside
 * rather than reacting to a gesture happening elsewhere.
 */
const FOLLOW_RATIO = 1;
/**
 * The page may slide right off the right-hand edge; there is nothing underneath
 * it to protect. Capped at the viewport width only so an enthusiastic drag
 * cannot push it into empty space beyond that.
 */
function followLimit(): number {
	return window.innerWidth;
}
/** Long enough to read as "it snapped back", short enough not to feel stuck. */
const SETTLE_MS = 220;
/**
 * The commit: the page carries on to the right and off the screen. Quicker than
 * the snap-back, and linear-out rather than soft-landing — it is leaving, not
 * coming to rest.
 */
const EXIT_MS = 200;
const EXIT_EASE = 'cubic-bezier(0.32, 0, 0.67, 0)';
/**
 * How long the exit transform may outlive the navigation before it is cleared
 * regardless. Only reached if the navigation never arrives — without it a page
 * that failed to change would be left parked off-screen.
 */
const EXIT_RESET_MS = 900;
/**
 * Decelerating hard at the end reads as weight rather than as a linear slide
 * stopping dead. easeOutQuint.
 */
const SETTLE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
/**
 * How far the finger travels before the drag is judged at all. Subtracted from
 * the distance the page follows, so it starts moving from nothing instead of
 * jumping this far the moment it is recognised.
 */
const MOVE_THRESHOLD_PX = 8;

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
export function useSwipeBack(
	backHref: () => string | null | undefined,
	/** Mirrors `BackButton`'s: always this destination, never history. */
	settings?: { exact?: boolean },
) {
	// The page left parked off the right edge by a committed gesture, waiting for
	// the navigation it triggered. Held here rather than inside the effect
	// because it has to survive the effect being torn down mid-flight — which is
	// exactly what navigating does.
	let exiting: HTMLElement | null = null;

	function clearExit() {
		const el = exiting;
		exiting = null;
		if (!el) return;
		el.style.transition = 'none';
		el.style.transform = '';
		el.style.willChange = '';
		// Cleared on the next frame so removing the transition cannot animate the
		// reset it was meant to skip.
		requestAnimationFrame(() => {
			el.style.transition = '';
		});
	}

	// The moment the destination has rendered: the surface can drop back to rest
	// carrying the new page, with nothing of the old one left to show.
	afterNavigate(clearExit);

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
		// True once the drag has proved itself horizontal. Separate from `start`,
		// which only means a gesture is being considered.
		let swiping = false;
		let scrollLocked = false;
		// The rAF handle and the position it will paint, so several pointer events
		// in one frame collapse into a single write.
		let frame = 0;
		let pendingShift = 0;

		/**
		 * Slide the page with the finger. This is the whole point of the
		 * animation — an accidental swipe announces itself while there is still
		 * time to drag back and cancel, instead of navigating out from under
		 * someone who meant to scroll.
		 */
		function follow(dx: number) {
			if (!surface) return;
			// Starts from zero rather than from the recognition threshold, so the
			// page eases out of rest instead of snapping 8px sideways.
			pendingShift = Math.min(
				Math.max(dx - MOVE_THRESHOLD_PX, 0) * FOLLOW_RATIO,
				followLimit(),
			);
			// Pointer events can outpace the display; painting on demand would
			// write the same frame several times and force layout with each one.
			// One write per frame, always the latest position.
			frame ||= requestAnimationFrame(paint);
		}

		function paint() {
			frame = 0;
			if (!surface) return;
			surface.style.transition = 'none';
			// translate3d rather than translateX: it keeps the page on its own
			// compositing layer, so a drag moves an existing texture instead of
			// repainting the conversation every frame.
			surface.style.transform = `translate3d(${pendingShift}px, 0, 0)`;
		}

		/** Undo everything `follow` did. Safe to call when it never ran. */
		function settle(animated: boolean) {
			// Every path out of a gesture goes through here, which makes it the one
			// place the scroll lock has to be released.
			swiping = false;
			unlockScroll();
			if (frame) {
				cancelAnimationFrame(frame);
				frame = 0;
			}
			const el = surface;
			surface = null;
			if (!el) return;
			el.style.transition = animated ? `transform ${SETTLE_MS}ms ${SETTLE_EASE}` : 'none';
			el.style.transform = '';
			// Leaving a transition on the element would slow down whatever the
			// page does with it next, and `will-change` costs memory for a layer
			// nothing is animating any more.
			if (animated) {
				setTimeout(() => {
					el.style.transition = '';
					el.style.willChange = '';
				}, SETTLE_MS);
			} else {
				el.style.transition = '';
				el.style.willChange = '';
			}
		}

		function onPointerDown(e: PointerEvent) {
			start = null;
			// Cleared here as well as on release, because release is not
			// guaranteed: a drag that ends outside the window — trivial to do with
			// a mouse in the Simulator, and possible on a device when the system
			// takes the touch — leaves no pointerup and no pointercancel. A stuck
			// `swiping` means `onTouchMove` cancels every scroll from then on, so
			// the next touch starts by clearing it.
			swiping = false;
			if (e.pointerType !== 'touch' || !e.isPrimary) return;
			if (e.target instanceof Element) {
				if (e.target.closest(CLAIMS_HORIZONTAL)) return;
				if (inHorizontalScroller(e.target)) return;
			}
			start = { id: e.pointerId, x: e.clientX, y: e.clientY, at: e.timeStamp };
			// Bound now, before anything has been decided, and this is the whole
			// reason the gesture feels crisp. A non-passive `touchmove` makes the
			// browser wait for this handler before it scrolls anything, which is
			// what buys the chance to claim the drag. Bound at recognition instead,
			// the first movements have already gone to the scroller, iOS has
			// committed the touch to scrolling, and every `touchmove` after that
			// arrives non-cancelable — the swipe then drags the page while the list
			// scrolls underneath it.
			//
			// Nothing else happens here: no surface lookup, no layer promotion.
			// Those cost real work on a list, and a scroll must not pay for them.
			lockScroll();
		}

		/**
		 * Decides what the finger is doing, and acts on it in the same event.
		 *
		 * Both halves have to happen here rather than in `pointermove`:
		 * `preventDefault` on a pointer event does nothing to scrolling, so
		 * deciding there and cancelling here would always be a frame late.
		 */
		function onTouchMove(e: TouchEvent) {
			if (!start) return;
			const touch = e.touches[0];
			if (!touch) return;

			const dx = touch.clientX - start.x;
			const dy = touch.clientY - start.y;

			if (!swiping) {
				// Nothing is decided until the finger has actually moved; judging
				// direction from a jitter of a pixel or two throws away real
				// gestures. Returning without preventing lets the browser get on
				// with whatever it was going to do.
				if (Math.abs(dx) < MOVE_THRESHOLD_PX && Math.abs(dy) < MOVE_THRESHOLD_PX) return;

				// Up-and-down, or leftward: not ours. Unbinding hands the rest of
				// the gesture back to the scroller for good — a drag that starts as
				// a scroll must never turn into a back swipe halfway through.
				if (dx <= 0 || Math.abs(dx) < Math.abs(dy) * HORIZONTAL_RATIO) {
					start = null;
					unlockScroll();
					settle(true);
					return;
				}

				swiping = true;
				surface = document.querySelector<HTMLElement>(SURFACE);
				if (surface) surface.style.willChange = 'transform';
			}

			// Ours from here: the list must hold still while the page is dragged
			// aside. Not cancelable means iOS took the touch first — nothing to be
			// done about that one, and the ratio test above is what keeps it rare.
			if (e.cancelable) e.preventDefault();
			follow(dx);
		}

		// Bound only while a swipe is actually in progress, and torn down the
		// moment it ends.
		//
		// It used to sit on the document permanently, cancelling or not depending
		// on a flag — which meant every ordinary scroll on the app went through a
		// non-passive handler, and any path that left the flag set killed
		// scrolling outright until the page reloaded. Nothing to get stuck now:
		// when no swipe is running the listener does not exist, so touch handling
		// is exactly as it would be without this hook.
		function lockScroll() {
			if (scrollLocked) return;
			scrollLocked = true;
			document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
		}

		function unlockScroll() {
			if (!scrollLocked) return;
			scrollLocked = false;
			document.removeEventListener('touchmove', onTouchMove, true);
		}

		/**
		 * Carries the page the rest of the way off the right edge, then
		 * navigates.
		 *
		 * The gesture used to end by snapping the page home and navigating in the
		 * same breath, which read as the screen vanishing rather than being
		 * pushed aside. Finishing the movement is the whole point: the reveal
		 * layer underneath already shows where you are going, so once the page
		 * has cleared the edge the destination is simply there.
		 *
		 * The transform stays until `afterNavigate` clears it. Resetting it any
		 * earlier would put the *old* page back at rest for the frames before the
		 * new one renders.
		 */
		function flingOut(target: string) {
			if (frame) {
				cancelAnimationFrame(frame);
				frame = 0;
			}
			swiping = false;
			unlockScroll();
			const el = surface;
			surface = null;
			if (!el) {
				goBack(target, { exact: settings?.exact });
				return;
			}

			exiting = el;
			el.style.transition = `transform ${EXIT_MS}ms ${EXIT_EASE}`;
			el.style.transform = `translate3d(${window.innerWidth}px, 0, 0)`;

			setTimeout(() => goBack(target, { exact: settings?.exact }), EXIT_MS);
			// A navigation that never happens — a destination equal to where we
			// already are, say — would otherwise leave the page off-screen for
			// good, with no way back to it.
			setTimeout(clearExit, EXIT_RESET_MS);
		}

		function onPointerUp(e: PointerEvent) {
			const from = start;
			start = null;
			swiping = false;
			if (!from || e.pointerId !== from.id) {
				settle(true);
				return;
			}

			const dx = e.clientX - from.x;
			const elapsed = e.timeStamp - from.at;
			const flicked = dx > FLICK_MIN_PX && dx / Math.max(elapsed, 1) > FLICK_VELOCITY;
			const commit = elapsed <= MAX_DURATION_MS && (dx > DISTANCE_PX || flicked);

			if (commit) flingOut(href);
			else settle(true);
		}

		function onPointerCancel() {
			start = null;
			swiping = false;
			settle(true);
		}

		// No `pointermove`: the movement is read from `touchmove` instead, which is
		// the only event where the drag can be judged and the scroll cancelled at
		// the same moment. These three are lifecycle only.
		const opts = { passive: true } as const;
		document.addEventListener('pointerdown', onPointerDown, opts);
		document.addEventListener('pointerup', onPointerUp, opts);
		document.addEventListener('pointercancel', onPointerCancel, opts);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('pointerup', onPointerUp);
			document.removeEventListener('pointercancel', onPointerCancel);
			document.removeEventListener('touchmove', onTouchMove, true);
			// Unmounting mid-gesture would otherwise leave the page shifted.
			settle(false);
		};
	});
}
