import type { Action } from 'svelte/action';

/**
 * Moves the node to `<body>`, so `position: fixed` means what it says.
 *
 * A dialog is rendered by whoever owns its state — the file picker lives in the
 * composer, the reaction picker in the message row — and those places sit inside
 * the app's glass chrome. An element with `backdrop-filter` (also `filter`,
 * `transform`, `perspective`, `contain: paint`) becomes the containing block for
 * fixed-position descendants, so `inset: 0` resolves against the composer bar
 * rather than the viewport: the scrim shrinks to a strip and the panel centred
 * inside it is clipped out of sight.
 *
 * Reparenting is the only fix that doesn't constrain where a dialog may be
 * opened from. Svelte still owns the node and removes it on unmount; `destroy`
 * only makes that deterministic now that the node's parent isn't the one Svelte
 * created it in.
 */
export const portal: Action<HTMLElement> = (node) => {
	document.body.appendChild(node);
	return {
		destroy() {
			node.remove();
		},
	};
};
