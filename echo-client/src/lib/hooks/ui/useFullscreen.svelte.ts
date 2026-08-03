/**
 * Native fullscreen for one element, and an honest answer to "is it fullscreen
 * right now".
 *
 * The state has to come from the document rather than from the toggle: Esc, F11
 * and the system gesture all leave fullscreen without the button ever firing,
 * and an icon that tracked its own clicks would start lying.
 */
export function useFullscreen(target: () => HTMLElement | null) {
	let active = $state(false);

	$effect(() => {
		const el = target();
		const sync = () => {
			active = document.fullscreenElement === el;
		};
		sync();
		document.addEventListener('fullscreenchange', sync);
		return () => document.removeEventListener('fullscreenchange', sync);
	});

	return {
		get active() { return active; },

		async toggle() {
			try {
				if (document.fullscreenElement) await document.exitFullscreen();
				else await target()?.requestFullscreen();
			} catch (err) {
				console.warn('[useFullscreen] toggle failed', err);
			}
		},
	};
}
