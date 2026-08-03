import { resolveUrl, blobCrossOrigin } from '$lib/api/client.js';

/**
 * The length of an uploaded audio file, read from its header. Recorded voice
 * messages ship a duration with the attachment; an arbitrary upload has none, so
 * it has to be asked for.
 *
 * `preload="metadata"` fetches only the header — a few KB — which is what makes
 * showing a length before anything is played affordable.
 */
export function useAudioDuration(url: () => string) {
	let duration = $state(0);

	$effect(() => {
		const src = resolveUrl(url());
		if (!src) return;
		const probe = new Audio();
		probe.preload = 'metadata';
		if (blobCrossOrigin) probe.crossOrigin = blobCrossOrigin;
		const onLoaded = () => {
			if (Number.isFinite(probe.duration)) duration = probe.duration;
		};
		probe.addEventListener('loadedmetadata', onLoaded, { once: true });
		probe.src = src;
		return () => {
			probe.removeEventListener('loadedmetadata', onLoaded);
			probe.src = '';
		};
	});

	return {
		get value() { return duration; },
	};
}
