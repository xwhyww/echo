import { untrack } from 'svelte';

/** Fine enough that the progress bar reads as motion, not as steps. */
const TICK = 50;

/**
 * The auto-dismiss clock behind `Toast` and `UndoBar`: counts `duration` down
 * and fires once at zero. Restarts whenever the duration changes, so a
 * re-used host element gets a fresh countdown rather than a stale remainder.
 *
 * Wrap a callback *prop* at the call site — `() => onclose()`, not `onclose` —
 * so the elapsed handler is whatever the prop is when the clock runs out.
 */
export function useCountdown(duration: () => number, onelapsed: () => void) {
	let remaining = $state(untrack(duration));

	$effect(() => {
		remaining = duration();
		const interval = setInterval(() => {
			remaining -= TICK;
			if (remaining <= 0) {
				clearInterval(interval);
				onelapsed();
			}
		}, TICK);

		return () => clearInterval(interval);
	});

	return {
		get remaining() {
			return remaining;
		},
		/** 1 → 0, for scaling the bar. */
		get progress() {
			return remaining / duration();
		},
	};
}
