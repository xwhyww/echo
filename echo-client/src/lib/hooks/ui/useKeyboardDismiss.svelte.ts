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

export function useKeyboardDismiss() {
	$effect(() => {
		function dismiss() {
			const active = document.activeElement;
			if (active instanceof HTMLElement && active.closest(EDITABLE)) active.blur();
		}

		function outside(target: EventTarget | null): boolean {
			if (!(target instanceof Element)) return true;
			return !target.closest(`${EDITABLE}, [data-keeps-keyboard]`);
		}

		function onPointerDown(e: PointerEvent) {
			if (outside(e.target)) dismiss();
		}

		// `touchmove` rather than `scroll`: iOS fires scroll events while it
		// resizes the page around the keyboard it has just opened, which would
		// blur the field in the same breath as focusing it. A touchmove is always
		// a real finger, and it is the only one of the two that means "the user is
		// pushing the conversation around", which is when the keyboard is in the
		// way.
		function onTouchMove(e: TouchEvent) {
			if (outside(e.target)) dismiss();
		}

		// Capture, so a handler that stops propagation on its own subtree cannot
		// strand the keyboard open.
		document.addEventListener('pointerdown', onPointerDown, true);
		document.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
		return () => {
			document.removeEventListener('pointerdown', onPointerDown, true);
			document.removeEventListener('touchmove', onTouchMove, true);
		};
	});
}
