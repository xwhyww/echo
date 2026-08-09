/**
 * What kind of thing the app is being held in.
 *
 * A store rather than a helper because the answer can change while the app is
 * running — a tablet gets a keyboard case, a desktop window is dragged onto a
 * touchscreen — and because `matchMedia` should be listened to once, not per
 * component that happens to care.
 */

/**
 * A phone or a tablet: a coarse pointer, and therefore a soft keyboard with an
 * emoji key of its own. Deliberately the pointer and not the viewport width —
 * a narrow desktop window is still a mouse and a hardware keyboard, and would
 * lose affordances it has no substitute for.
 */
const TOUCH_QUERY = '(pointer: coarse)';

function initial(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false;
	return window.matchMedia(TOUCH_QUERY).matches;
}

let touch = $state(initial());

if (typeof window !== 'undefined' && window.matchMedia) {
	const mq = window.matchMedia(TOUCH_QUERY);
	// Never removed: this lives as long as the app does.
	mq.addEventListener('change', (e) => (touch = e.matches));
}

export const device = {
	/** True on phones and tablets; false with a mouse. */
	get isTouch(): boolean {
		return touch;
	},
};
