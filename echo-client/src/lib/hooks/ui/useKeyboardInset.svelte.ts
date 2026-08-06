/**
 * Makes the app shell end where the on-screen keyboard begins.
 *
 * The viewport meta asks for the default `interactive-widget` behaviour on
 * iOS — the keyboard shrinks the *visual* viewport and leaves the layout
 * viewport alone — so `100svh` keeps describing the full screen and the
 * bottom-anchored chrome (the composer, the mobile tab bar) stays underneath
 * the keyboard. The browser then has to reveal the focused field the only way
 * it can: by sliding the whole layout viewport up, which drags the header and
 * everything else with it.
 *
 * So: measure how much of the layout viewport the keyboard covers, publish it
 * as `--keyboard-inset`, and let the shell subtract it. The composer ends up
 * above the keyboard on its own, nothing needs revealing, and the page stops
 * moving. Chromium with `interactive-widget=resizes-content` resizes the
 * layout viewport itself, so there the measurement is 0 and this does nothing.
 *
 * Mounted once by the root layout, next to `useKeyboardDismiss`.
 */
export function useKeyboardInset() {
	$effect(() => {
		const vv = window.visualViewport;
		if (!vv) return;

		const root = document.documentElement;

		function apply() {
			// `offsetTop` is how far the visual viewport has already been pushed
			// up; without it the inset shrinks by exactly the amount the page has
			// been scrolled and the fix undoes itself.
			const covered = Math.max(0, root.clientHeight - vv!.height - vv!.offsetTop);
			root.style.setProperty('--keyboard-inset', `${Math.round(covered)}px`);

			// iOS may still have lifted the layout viewport before we resized the
			// shell. The field is in view without it now, so put the page back.
			if (window.scrollY !== 0) window.scrollTo(0, 0);
		}

		apply();
		vv.addEventListener('resize', apply);
		vv.addEventListener('scroll', apply);
		return () => {
			vv.removeEventListener('resize', apply);
			vv.removeEventListener('scroll', apply);
			root.style.removeProperty('--keyboard-inset');
		};
	});
}
