import type { AudioStage } from './types.js';

/**
 * The two AI noise-suppression stages. They are alternative implementations of
 * the same job, so the pipeline picks one — see `captureMic`.
 *
 * Both are dynamically imported: they carry WASM, and a user who never turns
 * them on shouldn't pay for them in the bundle. Both return `null` on failure
 * rather than throwing — losing suppression is not worth losing the microphone.
 */

export async function createDeepFilterNetStage(
	audioCtx: AudioContext,
): Promise<AudioStage | null> {
	try {
		const { DeepFilterNet3Core } = await import('deepfilternet3-noise-filter');
		const core = new DeepFilterNet3Core({
			sampleRate: 48000,
			// Library treats this as an attenuation knob (0–100 dB-ish). 80 is
			// the sweet spot the upstream demo uses — aggressive enough to flatten
			// keyboards without obviously chewing into speech.
			noiseReductionLevel: 80,
		});
		await core.initialize();
		const node = await core.createAudioWorkletNode(audioCtx);
		return {
			node,
			destroy: () => {
				try { core.destroy(); } catch {}
			},
		};
	} catch (err) {
		console.warn('[audio] DeepFilterNet unavailable:', err);
		return null;
	}
}

export async function createRnnoiseStage(audioCtx: AudioContext): Promise<AudioStage | null> {
	try {
		const mod = await import('@sapphi-red/web-noise-suppressor');
		// Two WASM builds: SIMD (faster, modern browsers) and non-SIMD fallback.
		// loadRnnoise picks the one the runtime supports.
		const wasmUrl = (await import('@sapphi-red/web-noise-suppressor/rnnoise.wasm?url')).default;
		const simdUrl = (await import('@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url')).default;
		const workletUrl = (await import('@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url')).default;

		const wasmBinary = await mod.loadRnnoise({ url: wasmUrl, simdUrl });
		await audioCtx.audioWorklet.addModule(workletUrl);

		return {
			node: new mod.RnnoiseWorkletNode(audioCtx, { wasmBinary, maxChannels: 1 }),
		};
	} catch (err) {
		console.warn('[audio] RNNoise unavailable, falling back to native:', err);
		return null;
	}
}
