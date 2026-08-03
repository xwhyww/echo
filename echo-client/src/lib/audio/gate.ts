/**
 * The gain node both gates are built on.
 *
 * A gate is a `GainNode` flipped between 0 and 1. It has to be ramped rather
 * than stepped — a hard 0↔1 jump at the moment speech starts is audible as a
 * click — and the two gates in the pipeline (voice detection, sensitivity)
 * ramp identically, so the ramping lives here.
 */

/** Open fast so the first phoneme isn't clipped. */
const RAMP_OPEN_S = 0.02;
/** Close slower so word tails don't get chopped. */
const RAMP_CLOSE_S = 0.12;

export interface Gate {
	node: GainNode;
	open: () => void;
	close: () => void;
}

/**
 * Starts closed: on join, silence must not leak the first frame of room noise
 * before anything has decided whether it is speech.
 */
export function createGate(audioCtx: AudioContext): Gate {
	const node = audioCtx.createGain();
	node.gain.value = 0;

	// Ramp from wherever the gain currently is, cancelling any ramp still in
	// flight, so a quick open-close-open doesn't stack schedules.
	function rampTo(target: number, seconds: number) {
		const now = audioCtx.currentTime;
		node.gain.cancelScheduledValues(now);
		node.gain.setValueAtTime(node.gain.value, now);
		node.gain.linearRampToValueAtTime(target, now + seconds);
	}

	return {
		node,
		open: () => rampTo(1, RAMP_OPEN_S),
		close: () => rampTo(0, RAMP_CLOSE_S),
	};
}
