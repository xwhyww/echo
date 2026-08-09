/**
 * Puts the on-screen keyboard away when the user taps outside the focused field
 * or drags the page underneath it.
 *
 * On iOS the keyboard normally carries a native accessory bar whose **Done**
 * button is, for most people, *the* way to dismiss it. `EchoInputAccessory.m`
 * removes that bar app-wide, so the affordance has to come from here instead —
 * see `IOS_KEYBOARD_ACCESSORY.md`. This is mounted once by the root layout and
 * covers every text surface: the composer, search, the login code.
 *
 * Anything carrying `data-keeps-keyboard` counts as part of the field it sits
 * next to rather than as "outside" — that is how the emoji picker stays usable
 * while the composer is still focused.
 */
const EDITABLE = 'input, textarea, [contenteditable="true"]';

/**
 * How long the `pointerup` fallback waits for a click that may never come.
 * Comfortably longer than the gap between the two on a page with a viewport
 * meta tag (no 300ms tap delay), and short enough that a keyboard closing
 * after it reads as immediate.
 */
const CLICK_GRACE_MS = 120;

export function useKeyboardDismiss() {
	$effect(() => {
		// Whether the gesture in flight produced a click. Not reactive: it is read
		// and written within one gesture, and nothing renders from it.
		let clicked = false;
		let fallbackTimer = 0;

		function dismiss() {
			const active = document.activeElement;
			if (active instanceof HTMLElement && active.closest(EDITABLE)) active.blur();
		}

		function outside(target: EventTarget | null): boolean {
			if (!(target instanceof Element)) return true;
			return !target.closest(`${EDITABLE}, [data-keeps-keyboard]`);
		}

		// `click`, not `pointerdown` — and this is the whole reason the tap outside
		// used to need doing twice.
		//
		// Blurring on finger-down puts the keyboard away *during* the gesture. The
		// page then reflows into the space it leaves — on a phone that is a third
		// of the viewport — so by the time the finger lifts, whatever was under it
		// has moved somewhere else. The browser resolves the click against the new
		// layout, and it lands on the wrong element or on nothing at all. The tap
		// read as "only closed the keyboard", and the user had to tap again.
		//
		// A click is dispatched against the layout as it was when the finger came
		// down, and capture runs before the target's own handler, so dismissing
		// here is still immediate — it just happens after the browser has already
		// decided who the tap belonged to.
		function onClick(e: MouseEvent) {
			clicked = true;
			if (outside(e.target)) dismiss();
		}

		// Fallback for the taps WebKit never turns into a click.
		//
		// On iOS a delegated `click` listener on `document` does not always fire
		// when the tap lands on an element the engine considers non-clickable — a
		// plain div or span with no handler, no role and no `cursor: pointer`. The
		// empty space around the message list is exactly that, so without this the
		// keyboard would simply stay up there.
		//
		// It cannot blur on the spot, or it would be `pointerdown` again with extra
		// steps: the click, if one is coming, has not been dispatched yet. So it
		// waits, and stands down if the click listener above got there first —
		// which is the normal case on every platform that behaves.
		//
		// Touch only. A mouse always produces a click, and a desktop has no
		// keyboard to put away.
		function onPointerUp(e: PointerEvent) {
			if (e.pointerType !== 'touch' || !outside(e.target)) return;
			clearTimeout(fallbackTimer);
			fallbackTimer = window.setTimeout(() => {
				if (!clicked) dismiss();
			}, CLICK_GRACE_MS);
		}

		// Each gesture gets its own verdict.
		function onPointerDown() {
			clicked = false;
			clearTimeout(fallbackTimer);
		}

		// `touchmove` rather than `scroll`: iOS fires scroll events while it
		// resizes the page around the keyboard it has just opened, which would
		// blur the field in the same breath as focusing it. A touchmove is always
		// a real finger, and it is the only one of the two that means "the user is
		// pushing the conversation around", which is when the keyboard is in the
		// way.
		//
		// This one stays on the way down, and can: a drag produces no click, so
		// there is nothing for the reflow to steal.
		function onTouchMove(e: TouchEvent) {
			if (outside(e.target)) dismiss();
		}

		// Capture throughout, so a handler that stops propagation on its own
		// subtree cannot strand the keyboard open.
		document.addEventListener('pointerdown', onPointerDown, true);
		document.addEventListener('pointerup', onPointerUp, true);
		document.addEventListener('click', onClick, true);
		document.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
		return () => {
			clearTimeout(fallbackTimer);
			document.removeEventListener('pointerdown', onPointerDown, true);
			document.removeEventListener('pointerup', onPointerUp, true);
			document.removeEventListener('click', onClick, true);
			document.removeEventListener('touchmove', onTouchMove, true);
		};
	});
}
