/** Two taps further apart than this in time, or in space, are two taps. */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_SLOP = 24;

/**
 * "Double-click, including on touch."
 *
 * `ondblclick` alone isn't enough: the viewport is zoomable, so a touch
 * double-tap is claimed by the browser's zoom gesture and the event never
 * arrives. The touch half is therefore reconstructed from raw pointer events —
 * which is also why the element wearing this needs `touch-action: manipulation`
 * to stop the zoom from firing anyway.
 *
 * `enabled` is asked at event time rather than passed as a flag, so it always
 * sees current state, and it doubles as the "not on a link or a button" test.
 */
export function useDoubleTap(options: {
	enabled: (target: EventTarget | null) => boolean;
	ontrigger: () => void;
}) {
	let lastTap: { at: number; x: number; y: number } | null = null;

	function fire(e: Event) {
		e.preventDefault();
		e.stopPropagation();
		// A double-click drags a selection over whatever was clicked; the gesture
		// is meant to leave nothing behind.
		window.getSelection()?.removeAllRanges();
		options.ontrigger();
	}

	return {
		/** Call when a press opens something else, so its release isn't a half-tap. */
		forget() {
			lastTap = null;
		},

		ondblclick(e: MouseEvent) {
			if (!options.enabled(e.target)) return;
			fire(e);
		},

		onpointerup(e: PointerEvent) {
			if (e.pointerType !== 'touch') return;
			if (!options.enabled(e.target)) {
				lastTap = null;
				return;
			}
			const prev = lastTap;
			if (
				prev &&
				e.timeStamp - prev.at < DOUBLE_TAP_MS &&
				Math.abs(e.clientX - prev.x) < DOUBLE_TAP_SLOP &&
				Math.abs(e.clientY - prev.y) < DOUBLE_TAP_SLOP
			) {
				lastTap = null;
				fire(e);
				return;
			}
			lastTap = { at: e.timeStamp, x: e.clientX, y: e.clientY };
		},
	};
}
