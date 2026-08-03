/** Anything quieter is silence — `log10(0)` is -Infinity and breaks comparison. */
export const SILENCE_DB = -140;

/**
 * Loudness of a block of samples, in dBFS.
 *
 * Both things that watch the microphone need this — the sensitivity gate, to
 * decide whether to open, and the test meter, to draw a bar — and they must
 * agree, or the bar would show the user a level the gate doesn't act on.
 */
export function rmsDb(samples: Float32Array): number {
	let sumSq = 0;
	for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i];
	const rms = Math.sqrt(sumSq / samples.length);
	return rms > 1e-7 ? 20 * Math.log10(rms) : SILENCE_DB;
}
