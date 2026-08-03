import { createGate } from './gate.js';
import type { AudioStage } from './types.js';

/**
 * Voice-activity gate: audio passes only while a model says it is hearing
 * speech. Answers "is this a voice?" — the sensitivity gate answers "is it loud
 * enough?", and the two compose.
 *
 * Silero is dynamically imported and failure is non-fatal: without it the
 * pipeline simply carries on ungated.
 */
export async function createVadGateStage(
	audioCtx: AudioContext,
	signalIn: AudioNode,
): Promise<AudioStage | null> {
	try {
		const { MicVAD } = await import('@ricky0123/vad-web');

		// Tap a copy of the upstream signal as a MediaStream. Silero VAD wants a
		// getStream() callback rather than an AudioNode, so we hand it the
		// destination's stream instead of replumbing into its internals.
		const tap = audioCtx.createMediaStreamDestination();
		signalIn.connect(tap);

		const gate = createGate(audioCtx);

		let destroyed = false;
		const vad = await MicVAD.new({
			audioContext: audioCtx,
			getStream: async () => tap.stream,
			pauseStream: async () => {},
			resumeStream: async (s) => s,
			startOnLoad: true,
			processorType: 'AudioWorklet',
			model: 'v5',
			onSpeechStart: () => {
				if (!destroyed) gate.open();
			},
			onSpeechEnd: () => {
				if (!destroyed) gate.close();
			},
			// A misfire is speech the model took back: close as if it had ended.
			onVADMisfire: () => {
				if (!destroyed) gate.close();
			},
		});

		return {
			node: gate.node,
			destroy: () => {
				destroyed = true;
				vad.destroy().catch(() => {});
				try { tap.disconnect(); } catch {}
			},
		};
	} catch (err) {
		console.warn('[audio] Silero VAD unavailable:', err);
		return null;
	}
}
