import { createGate } from './gate.js';
import { rmsDb } from './level.js';
import type { AudioStage } from './types.js';

/**
 * Manual noise gate: audio passes only while it is louder than the user's
 * threshold. Answers "is it loud enough?" — the VAD gate answers "is this a
 * voice?", and both must be open for anything to get through.
 */

/**
 * Open at the threshold, but only close once the level drops this far below it.
 * Without the hysteresis the gate flickers on word tails and breathing, where
 * the RMS hovers exactly at the threshold.
 */
const HYSTERESIS_DB = 3;

/**
 * Poll on a timer rather than `requestAnimationFrame` — RAF stops firing in a
 * backgrounded tab, which would freeze the gate wherever it happened to be
 * mid-call.
 */
const POLL_MS = 20;

export function createSensitivityGateStage(
	audioCtx: AudioContext,
	signalIn: AudioNode,
	thresholdDb: number,
): AudioStage {
	const analyser = audioCtx.createAnalyser();
	analyser.fftSize = 512;
	// Light internal smoothing so single-sample bursts (a finger hitting the
	// mic) don't trip the gate before the user actually speaks.
	analyser.smoothingTimeConstant = 0.4;
	signalIn.connect(analyser);

	const gate = createGate(audioCtx);
	const buf = new Float32Array(analyser.fftSize);

	let isOpen = false;
	let destroyed = false;

	const intervalId = setInterval(() => {
		if (destroyed) return;
		analyser.getFloatTimeDomainData(buf);
		const db = rmsDb(buf);
		if (!isOpen && db >= thresholdDb) {
			isOpen = true;
			gate.open();
		} else if (isOpen && db < thresholdDb - HYSTERESIS_DB) {
			isOpen = false;
			gate.close();
		}
	}, POLL_MS);

	return {
		node: gate.node,
		destroy: () => {
			destroyed = true;
			clearInterval(intervalId);
			try { analyser.disconnect(); } catch {}
		},
	};
}
