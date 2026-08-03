import { untrack } from 'svelte';

/** Where the highlight sits, in pixels relative to its bar. */
export interface PillBox {
	x: number;
	y: number;
	w: number;
	h: number;
	visible: boolean;
}

/**
 * One highlight that glides between the items of a bar, instead of each item
 * lighting up on its own.
 *
 * The hook owns the geometry only: it measures the item the caller points it
 * at and reports where the highlight should be. *Which* item that is stays
 * outside — a bar typically merges "the one being hovered" with "the one that
 * is actually current", and only the caller knows what current means.
 */
export function useSlidingPill(target: () => string | null) {
	let navEl = $state<HTMLElement | null>(null);
	const itemEls: Record<string, HTMLElement> = {};
	let box = $state<PillBox>({ x: 0, y: 0, w: 0, h: 0, visible: false });
	let animated = $state(false);

	function measure() {
		const id = target();
		const el = id ? itemEls[id] : null;
		if (!el || !navEl) {
			// Keep the last position and just fade out — sliding away to the
			// corner on the way out is worse than staying put. `untrack`: this
			// runs inside an `$effect`, and reading `box` there would make the
			// effect depend on the very state it writes.
			box = { ...untrack(() => box), visible: false };
			return;
		}
		const nav = navEl.getBoundingClientRect();
		const item = el.getBoundingClientRect();
		box = {
			x: item.left - nav.left,
			y: item.top - nav.top,
			w: item.width,
			h: item.height,
			visible: true,
		};
	}

	$effect(() => {
		void target();
		measure();
		// Skip the slide on the very first paint, or the pill flies in from the
		// corner on page load.
		requestAnimationFrame(() => (animated = true));
	});

	return {
		get nav() { return navEl; },
		set nav(el: HTMLElement | null) { navEl = el; },
		/** `bind:this` targets for the items, keyed the same way as `target`. */
		items: itemEls,
		get box() { return box; },
		get animated() { return animated; },
		/** Re-measure after something moved the bar — a resize, say. */
		measure,
	};
}
