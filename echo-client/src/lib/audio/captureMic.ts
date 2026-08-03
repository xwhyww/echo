// Shared microphone capture pipeline. Consumed by both voice messages
// (MediaRecorder) and voice channels (LiveKit publish), so the user's
// microphone settings — including the WASM suppression steps — apply uniformly.
//
// Effective chain (each stage is opt-in via settings):
//   getUserMedia (with native WebRTC DSP flags)
//     → AudioContext source
//     → DeepFilterNet 3 worklet (preferred AI suppression)         [optional]
//     → RNNoise worklet (legacy AI suppression — skipped if DFN on) [optional]
//     → Makeup gain (only when AI suppression attached)
//     → Soft limiter                                               [optional]
//     → VAD-driven gate                                            [optional]
//     → Sensitivity gate                                           [optional]
//     → Output gain (always — live-adjustable input volume)
//     → MediaStreamDestination
//
// Each stage lives in its own module; this one only decides which of them to
// build and wires them together.

import { createDeepFilterNetStage, createRnnoiseStage } from './noiseSuppression.js';
import { createSensitivityGateStage } from './sensitivityGate.js';
import { createVadGateStage } from './vadGate.js';
import type { AudioStage, MicCapture, ProcessingSettings } from './types.js';

export type { MicCapture, ProcessingSettings } from './types.js';

// Soft limiter: heavy compression only on peaks above the threshold, so quiet
// and normal-volume speech pass through untouched.
function createLimiterStage(audioCtx: AudioContext): AudioStage {
	const comp = audioCtx.createDynamicsCompressor();
	comp.threshold.value = -10;  // dBFS — start clamping above this
	comp.knee.value = 4;          // slight soft-knee so the limit isn't audible
	comp.ratio.value = 12;        // 12:1 → effectively a limiter, not a compressor
	comp.attack.value = 0.003;    // grab transients fast
	comp.release.value = 0.25;    // ease back smoothly
	return { node: comp };
}

function createGainStage(audioCtx: AudioContext, value: number): AudioStage & { node: GainNode } {
	const gain = audioCtx.createGain();
	gain.gain.value = value;
	return { node: gain };
}

export async function captureMic(settings: ProcessingSettings): Promise<MicCapture> {
	// DeepFilterNet supersedes RNNoise (they're alternative implementations of
	// the same job — stacking them just doubles CPU and confuses the second
	// model with a spectrum the first already mangled).
	const useDfn = settings.deepFilterNet;
	const useRnnoise = settings.rnnoise && !useDfn;
	const useAiSuppression = useDfn || useRnnoise;

	// When ML suppression is on, we override native NS and AGC. Stacking native
	// NS in front of an ML model feeds it a spectrum it wasn't trained on, and
	// AGC pumps up background noise during quiet moments, making the model's
	// job harder. Echo cancellation is a different problem, so we keep it.
	const useNativeNs = settings.noiseSuppression && !useAiSuppression;
	const useAgc = settings.autoGainControl && !useAiSuppression;

	const rawStream = await navigator.mediaDevices.getUserMedia({
		audio: {
			echoCancellation: settings.echoCancellation,
			noiseSuppression: useNativeNs,
			autoGainControl: useAgc,
			// `exact` would throw OverconstrainedError if the saved device is
			// gone; `ideal` falls back to the system default, which is the right
			// behaviour for a stored preference.
			...(settings.inputDeviceId ? { deviceId: { ideal: settings.inputDeviceId } } : {}),
			// RNNoise + DeepFilterNet are both trained at 48 kHz mono. Asking the
			// platform for that matches the AudioContext sample rate below and
			// avoids resampling inside the worklet — the source of most "leaky"
			// suppression reports.
			...(useAiSuppression ? { sampleRate: 48000, channelCount: 1 } : {}),
		},
	});

	// Force the context to 48 kHz when an ML model is active. Some platforms
	// still default to 44.1 kHz, and the worklet's quality drops noticeably
	// outside 48 kHz. Otherwise let the platform pick its native rate to avoid
	// an extra resample.
	const Ctx =
		window.AudioContext ||
		(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
	const audioCtx = useAiSuppression ? new Ctx({ sampleRate: 48000 }) : new Ctx();
	const source = audioCtx.createMediaStreamSource(rawStream);

	const chainNodes: AudioNode[] = [];
	const disposers: Array<() => void> = [];
	let head: AudioNode = source;

	// Append a stage to the chain: it becomes the new head, and its teardown
	// joins the pipeline's. `null` — a stage that failed to load — is a no-op.
	function attach(stage: AudioStage | null): boolean {
		if (!stage) return false;
		head.connect(stage.node);
		head = stage.node;
		chainNodes.push(stage.node);
		if (stage.destroy) disposers.push(stage.destroy);
		return true;
	}

	let aiSuppressionAttached = false;
	if (useDfn) {
		aiSuppressionAttached = attach(await createDeepFilterNetStage(audioCtx));
	} else if (useRnnoise) {
		aiSuppressionAttached = attach(await createRnnoiseStage(audioCtx));
	}

	// Makeup gain after AI suppression. We turn off native AGC when an ML stage
	// is active (it pumps noise during quiet moments and confuses the model),
	// but that also removes the loudness normalisation users get for free with
	// WebRTC default capture — so unsuppressed audio is noticeably louder than
	// suppressed audio. ~+6 dB lines them up roughly.
	if (aiSuppressionAttached) attach(createGainStage(audioCtx, 2));

	if (settings.loudnessLimit) attach(createLimiterStage(audioCtx));

	// The VAD goes after suppression so a clean signal feeds the model — less
	// noise, fewer false positives. Its analysis tap is wired from the current
	// head before the gate becomes the new one.
	if (settings.vadGate) attach(await createVadGateStage(audioCtx, head));

	// The manual gate sits after the VAD so the two compose: both must be open
	// for audio to pass. Stacking is intentional — some users want one, some
	// want both.
	if (settings.sensitivityEnabled) {
		attach(createSensitivityGateStage(audioCtx, head, settings.sensitivityThresholdDb));
	}

	// Always terminate the chain in a gain stage + destination, even when no
	// processing was requested. The gain defaults to 1 (passthrough), so this is
	// silent on its own — but it gives consumers a live handle for an
	// input-volume slider without needing to rebuild the pipeline on change.
	const outputGain = createGainStage(audioCtx, 1);
	attach(outputGain);

	const destination = audioCtx.createMediaStreamDestination();
	head.connect(destination);
	const outStream = destination.stream;

	const cleanup = () => {
		for (const fn of disposers) {
			try { fn(); } catch {}
		}
		for (const n of chainNodes) {
			try { n.disconnect(); } catch {}
		}
		try { source.disconnect(); } catch {}
		try { destination.disconnect(); } catch {}
		for (const t of rawStream.getTracks()) t.stop();
		for (const t of outStream.getTracks()) t.stop();
		audioCtx.close().catch(() => {});
	};

	return { stream: outStream, source, audioCtx, gain: outputGain.node, cleanup };
}
