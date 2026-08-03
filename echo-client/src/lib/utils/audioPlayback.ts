/**
 * The playback maths behind the three audio views (voice message, uploaded
 * audio, docked player bar). No DOM, no store, no runes — the parts worth
 * testing.
 */

/** How far across the clicked element the pointer landed, clamped to 0…1. */
export function seekRatio(e: MouseEvent): number {
	const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
	if (rect.width <= 0) return 0;
	return clamp01((e.clientX - rect.left) / rect.width);
}

/** Position as a fraction of the whole; 0 while the length is still unknown. */
export function playbackProgress(currentTime: number, duration: number): number {
	if (duration <= 0) return 0;
	return clamp01(currentTime / duration);
}

/**
 * `audio.currentTime` counts what has been queued to the audio device, but the
 * speaker plays it `latency` later (Windows shared mode sits at 0.3–0.5s), so an
 * uncorrected bar visibly leads the sound. Shifting the position back by the
 * latency fixes that; rescaling the remainder keeps the bar reaching 100% at the
 * end instead of freezing `latency` short of it.
 */
export function latencyProgress(currentTime: number, duration: number, latency: number): number {
	if (duration <= latency) return playbackProgress(currentTime, duration);
	return playbackProgress(currentTime - latency, duration - latency);
}

/**
 * Inverse of `latencyProgress`: the time to seek to so that a click at `ratio`
 * lands where the bar *displays* `ratio`, not at `ratio` of the raw duration.
 */
export function latencySeekTarget(ratio: number, duration: number, latency: number): number {
	return duration > latency ? ratio * (duration - latency) + latency : ratio * duration;
}

/**
 * Collapses a waveform to at most `count` bars, each the peak of its slice — a
 * recording's few hundred samples have to fit a strip a hundred pixels wide
 * without turning to mush.
 */
export function downsamplePeaks(src: number[], count: number): number[] {
	if (src.length <= count) return src;
	const out: number[] = new Array(count);
	const step = src.length / count;
	for (let i = 0; i < count; i++) {
		const start = Math.floor(i * step);
		const end = Math.max(start + 1, Math.floor((i + 1) * step));
		let max = 0;
		for (let j = start; j < end; j++) if (src[j] > max) max = src[j];
		out[i] = max;
	}
	return out;
}

/**
 * What the readout beside a waveform shows: how far in we are once the track has
 * been started, its total length before that.
 */
export function elapsedOrTotal(playing: boolean, currentTime: number, duration: number): number {
	return playing || currentTime > 0 ? currentTime : duration;
}

function clamp01(v: number): number {
	return Math.min(1, Math.max(0, v));
}
