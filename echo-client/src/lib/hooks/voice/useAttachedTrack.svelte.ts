/** Just enough of a LiveKit track to attach — keeps the hook out of the SDK. */
export interface AttachableTrack {
	attach(element: HTMLMediaElement): unknown;
	detach(element: HTMLMediaElement): unknown;
}

/**
 * Binds a media track to an element for as long as both exist.
 *
 * `attach()` mutates the element's `srcObject` and wires up the play/visibility
 * hooks; re-attaching on either change and detaching on teardown is what keeps a
 * stopped share from leaving an element holding a live `MediaStream`. Every
 * surface that shows a track needs exactly this, so it is written once.
 */
export function useAttachedTrack(
	element: () => HTMLMediaElement | null,
	track: () => AttachableTrack,
) {
	$effect(() => {
		const el = element();
		if (!el) return;
		const t = track();
		t.attach(el);
		return () => {
			// Detaching a track whose room has already gone throws; the element is
			// being discarded in that case anyway.
			try {
				t.detach(el);
			} catch {}
		};
	});
}
