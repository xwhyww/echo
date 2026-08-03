import { voiceVolumes } from '$lib/stores/voiceVolumes.svelte.js';

/**
 * A watcher's loudness for one presenter's shared audio. Kept apart from that
 * person's mic volume on purpose: a quiet voice setting must not silence the
 * video they are sharing.
 *
 * Muting remembers where the slider was, so unmuting returns there instead of
 * jumping to a hardcoded 100%.
 */
export function useScreenShareVolume(identity: () => string) {
	const value = $derived(voiceVolumes.getScreenShareVolume(identity()));
	const muted = $derived(value === 0);

	let lastAudible = $state(1);
	$effect(() => {
		if (value > 0) lastAudible = value;
	});

	return {
		get value() { return value; },
		get percent() { return Math.round(value * 100); },
		get muted() { return muted; },

		set(v: number) {
			voiceVolumes.setScreenShareVolume(identity(), v);
		},

		toggleMute() {
			if (muted) {
				voiceVolumes.setScreenShareVolume(identity(), lastAudible || 1);
				return;
			}
			// The effect above runs after this write, so take the snapshot here.
			if (value > 0) lastAudible = value;
			voiceVolumes.setScreenShareVolume(identity(), 0);
		},
	};
}
