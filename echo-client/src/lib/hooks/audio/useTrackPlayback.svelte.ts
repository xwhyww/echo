import { audioPlayer, type PlayerTrack } from '$lib/stores/audioPlayer.svelte.js';
import { elapsedOrTotal, playbackProgress, seekRatio } from '$lib/utils/audioPlayback.js';

/**
 * One playable attachment's view of the single global player: whether it is the
 * track currently loaded, how far it has got, and the two controls every
 * playable bubble offers — toggle and click-to-seek. Playback itself belongs to
 * `audioPlayer`; only one sound is ever audible, so only one `<audio>` exists.
 *
 * `track` is a getter because callers fill in a duration they learn later.
 */
export function useTrackPlayback(track: () => PlayerTrack) {
	const isCurrent = $derived(audioPlayer.current?.id === track().id);
	const playing = $derived(isCurrent && audioPlayer.playing);
	const currentTime = $derived(isCurrent ? audioPlayer.currentTime : 0);
	// Once the player has metadata its reading wins: it is the exact length,
	// where the caller's is whatever was recorded or probed up front.
	const duration = $derived(
		isCurrent && audioPlayer.duration > 0 ? audioPlayer.duration : track().duration,
	);

	return {
		get isCurrent() { return isCurrent; },
		get playing() { return playing; },
		get currentTime() { return currentTime; },
		get duration() { return duration; },
		get progress() { return playbackProgress(currentTime, duration); },
		/** Seconds for the readout: elapsed once started, total before. */
		get displayTime() { return elapsedOrTotal(playing, currentTime, duration); },

		toggle() {
			if (isCurrent) audioPlayer.toggle();
			else audioPlayer.play(track());
		},

		/** Clicking the waveform or the track jumps there, starting it if needed. */
		seek(e: MouseEvent) {
			if (duration <= 0) return;
			if (!isCurrent) audioPlayer.play(track());
			audioPlayer.seek(seekRatio(e) * duration);
		},
	};
}
