// Voice-message recorder: wraps MediaRecorder + WebAudio AnalyserNode.
//
// Exposes a thin imperative API consumed by VoiceRecorder.svelte. We sample
// amplitude at ~10 Hz during recording so the UI can draw a live waveform,
// then downsample the captured peak buffer to a fixed-length array on stop
// (so message storage / re-render cost is constant regardless of length).

import { getMicrophoneSettings } from '$lib/stores/microphoneSettings.svelte.js';
import { captureMic } from '$lib/audio/captureMic.js';

export const VOICE_MIME = 'audio/webm;codecs=opus';
export const VOICE_FILE_MIME = 'audio/webm';
export const PEAK_SAMPLE_HZ = 10;
export const STORED_PEAK_COUNT = 48;
export const MAX_DURATION_MS = 5 * 60 * 1000;

export interface VoiceRecording {
	blob: Blob;
	mimeType: string;
	durationSec: number;
	peaks: number[];
}

export interface RecorderHandle {
	stop(): Promise<VoiceRecording>;
	cancel(): void;
	// Live-updating arrays/values. Callers re-read these on a rAF loop; we
	// don't push events because Svelte components prefer to drive their own
	// state updates.
	getLivePeaks(): number[];
	getLevel(): number;
	getElapsedMs(): number;
}

function pickMimeType(): string {
	if (typeof MediaRecorder === 'undefined') return VOICE_MIME;
	if (MediaRecorder.isTypeSupported(VOICE_MIME)) return VOICE_MIME;
	if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
	if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
	return '';
}

function downsamplePeaks(buf: number[], target: number): number[] {
	if (buf.length === 0) return new Array(target).fill(0);
	if (buf.length <= target) {
		// Pad short clips so the waveform still looks even.
		const out = buf.slice();
		while (out.length < target) out.push(0);
		return normalize(out);
	}
	const out: number[] = new Array(target).fill(0);
	const step = buf.length / target;
	for (let i = 0; i < target; i++) {
		const start = Math.floor(i * step);
		const end = Math.floor((i + 1) * step);
		let max = 0;
		for (let j = start; j < end; j++) {
			if (buf[j] > max) max = buf[j];
		}
		out[i] = max;
	}
	return normalize(out);
}

// Subtract the mic's noise floor before scaling so a silent recording doesn't
// stretch hiss into a full-height waveform. Anything below the floor reads as
// zero; the rest fills the 0..100 range proportionally to the loudest peak.
// Calibrated for RMS energy on the 0..127 scale — room noise typically lands
// at ~0.5–1.5 here, real speech at 10+.
const PEAK_NOISE_FLOOR = 2;

function normalize(arr: number[]): number[] {
	let rawMax = 0;
	for (const v of arr) if (v > rawMax) rawMax = v;
	if (rawMax === 0) return arr.map(() => 0);
	// Adaptive floor: only subtract the noise floor when the loudest peak sits
	// well above it. On a quiet mic the whole signal lives near the floor, so
	// subtracting would zero everything out — keep the proportional shape.
	const floor = rawMax > PEAK_NOISE_FLOOR * 2 ? PEAK_NOISE_FLOOR : 0;
	const damped = arr.map((v) => Math.max(0, v - floor));
	let max = 0;
	for (const v of damped) if (v > max) max = v;
	if (max === 0) return damped.map(() => 0);
	const scale = 100 / max;
	return damped.map((v) => Math.round(Math.min(100, v * scale)));
}

export async function startRecording(): Promise<RecorderHandle> {
	const settings = getMicrophoneSettings();
	const capture = await captureMic(settings);
	const { stream: recordStream, source, audioCtx } = capture;

	const mimeType = pickMimeType();
	const recorder = new MediaRecorder(recordStream, mimeType ? { mimeType } : undefined);
	const chunks: Blob[] = [];
	recorder.ondataavailable = (e) => {
		if (e.data && e.data.size > 0) chunks.push(e.data);
	};

	// Live analyser taps the *raw* source so the in-progress recorder UI
	// reflects what the user hears at the mic — post-pipeline level can drop
	// dramatically during VAD/gate close, which would make the visualizer
	// look broken while the user is talking.
	const liveAnalyser = audioCtx.createAnalyser();
	liveAnalyser.fftSize = 1024;
	source.connect(liveAnalyser);

	// Stored-peaks analyser taps the *processed* signal (same point the
	// MediaRecorder reads from) so the persisted peaks share the pipeline's
	// latency and line up with the blob on playback. Tapping raw here caused
	// the player's bar fill to lead the audible sound by ~hundreds of ms
	// (DFN/RNNoise + VAD ramps add up).
	const storedAnalyser = audioCtx.createAnalyser();
	storedAnalyser.fftSize = 1024;
	capture.gain.connect(storedAnalyser);

	const liveBuf = new Float32Array(liveAnalyser.fftSize);
	const storedBuf = new Float32Array(storedAnalyser.fftSize);
	const livePeaks: number[] = [];
	const storedPeaksRaw: number[] = [];
	let liveLevel = 0;
	const startedAt = performance.now();
	let stoppedAt = 0;

	const sampleIntervalMs = 1000 / PEAK_SAMPLE_HZ;
	const sampleTimer = setInterval(() => {
		// Float samples in [-1, 1] preserve resolution for quiet mics where
		// byte-quantized data would collapse every frame to the same peak.
		liveAnalyser.getFloatTimeDomainData(liveBuf);
		let liveSumSq = 0;
		for (let i = 0; i < liveBuf.length; i++) {
			liveSumSq += liveBuf[i] * liveBuf[i];
		}
		const liveRms = Math.sqrt(liveSumSq / liveBuf.length); // 0..1
		livePeaks.push(liveRms * 127);
		liveLevel = liveRms;

		storedAnalyser.getFloatTimeDomainData(storedBuf);
		let storedSumSq = 0;
		for (let i = 0; i < storedBuf.length; i++) {
			storedSumSq += storedBuf[i] * storedBuf[i];
		}
		const storedRms = Math.sqrt(storedSumSq / storedBuf.length);
		storedPeaksRaw.push(storedRms * 127);
	}, sampleIntervalMs);

	const cleanup = () => {
		clearInterval(sampleTimer);
		capture.cleanup();
	};

	recorder.start(100); // collect data every 100ms

	let cancelled = false;

	return {
		async stop() {
			if (cancelled) throw new Error('recorder cancelled');
			stoppedAt = performance.now();
			const blob: Blob = await new Promise((resolve) => {
				recorder.onstop = () => {
					resolve(new Blob(chunks, { type: mimeType || 'audio/webm' }));
				};
				if (recorder.state !== 'inactive') recorder.stop();
				else resolve(new Blob(chunks, { type: mimeType || 'audio/webm' }));
			});
			cleanup();
			const durationSec = Math.max(0.1, (stoppedAt - startedAt) / 1000);
			const peaks = downsamplePeaks(storedPeaksRaw, STORED_PEAK_COUNT);
			return {
				blob,
				mimeType: blob.type || 'audio/webm',
				durationSec,
				peaks,
			};
		},
		cancel() {
			cancelled = true;
			try {
				if (recorder.state !== 'inactive') recorder.stop();
			} catch {}
			cleanup();
		},
		getLivePeaks() {
			return livePeaks;
		},
		getLevel() {
			return liveLevel;
		},
		getElapsedMs() {
			return performance.now() - startedAt;
		},
	};
}

export function formatDuration(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${s.toString().padStart(2, '0')}`;
}

export function recordingToFile(rec: VoiceRecording): File {
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const ext = rec.mimeType.includes('mp4') ? 'm4a' : 'webm';
	return new File([rec.blob], `voice-${stamp}.${ext}`, {
		type: rec.mimeType || VOICE_FILE_MIME,
	});
}
