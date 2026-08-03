import { captureMic, type MicCapture } from '$lib/audio/captureMic.js';
import { rmsDb } from '$lib/audio/level.js';
import { getMicrophoneSettings } from '$lib/stores/microphoneSettings.svelte.js';
import { voiceVolumes } from '$lib/stores/voiceVolumes.svelte.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';

export type MicTestPhase = 'idle' | 'starting' | 'live' | 'recording';

/**
 * Meter scale: -60 dB reads as empty, 0 dB as full. dB is the natural unit —
 * it is what the sensitivity threshold is set in, and it leaves quiet sounds
 * enough room to visibly move the bar without squashing the loud end.
 */
const METER_FLOOR_DB = -60;
const METER_CEIL_DB = 0;

/** Where a dB value sits on the meter, 0–1. */
export function meterPosition(db: number): number {
	return Math.max(0, Math.min(1, (db - METER_FLOOR_DB) / (METER_CEIL_DB - METER_FLOOR_DB)));
}

/**
 * MediaRecorder output is small enough to keep in memory and is never
 * persisted; the cap keeps a forgotten recording from piling up.
 */
const MAX_RECORD_MS = 5000;

/**
 * "Test your microphone": opens the real capture pipeline, so the meter shows
 * what teammates would hear — after suppression, gating and the user's own
 * gain — and can record a few seconds to play back.
 */
export function useMicTest() {
	const t = $derived(i18n.t);

	let phase = $state<MicTestPhase>('idle');
	let error = $state<string | null>(null);
	let level = $state(0); // 0..1, post-suppression
	let recordedUrl = $state<string | null>(null);

	// Plain refs: nothing in the markup reads them, so they need no reactivity.
	let capture: MicCapture | null = null;
	let analyser: AnalyserNode | null = null;
	let analyserBuf: Float32Array<ArrayBuffer> | null = null;
	let rafId: number | null = null;
	let recorder: MediaRecorder | null = null;
	let recordedChunks: Blob[] = [];
	let recordTimeout: ReturnType<typeof setTimeout> | null = null;

	function tickMeter() {
		if (!analyser || !analyserBuf) return;
		analyser.getFloatTimeDomainData(analyserBuf);
		level = meterPosition(rmsDb(analyserBuf));
		rafId = requestAnimationFrame(tickMeter);
	}

	function clearRecording() {
		if (recordedUrl) {
			URL.revokeObjectURL(recordedUrl);
			recordedUrl = null;
		}
	}

	async function start() {
		if (phase !== 'idle') return;
		error = null;
		phase = 'starting';
		try {
			capture = await captureMic(getMicrophoneSettings());
			// Apply the user's mic volume the same way voiceClient does, so the
			// meter reflects what teammates would actually hear.
			capture.gain.gain.value = voiceVolumes.micGain;

			analyser = capture.audioCtx.createAnalyser();
			analyser.fftSize = 512;
			analyser.smoothingTimeConstant = 0.6;
			// Tap the *output* gain stage — that's the signal that gets published,
			// with all suppression / VAD / makeup gain applied.
			capture.gain.connect(analyser);
			analyserBuf = new Float32Array(analyser.fftSize);
			tickMeter();

			phase = 'live';
		} catch (err) {
			console.error('[useMicTest] start failed', err);
			error = (err as Error).message ?? t.audio.test.accessFailed;
			stop();
		}
	}

	function stop() {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
		stopRecording();
		recorder = null;
		try { analyser?.disconnect(); } catch {}
		analyser = null;
		analyserBuf = null;
		capture?.cleanup();
		capture = null;
		level = 0;
		phase = 'idle';
	}

	function chooseMimeType(): string | undefined {
		// MediaRecorder support varies — pick the first the browser admits.
		// Returning undefined lets the browser fall back to its own default.
		const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
		for (const type of candidates) {
			if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
		}
		return undefined;
	}

	function record() {
		if (!capture || phase !== 'live') return;
		recordedChunks = [];
		clearRecording();

		const mimeType = chooseMimeType();
		try {
			recorder = mimeType
				? new MediaRecorder(capture.stream, { mimeType })
				: new MediaRecorder(capture.stream);
		} catch (err) {
			console.error('[useMicTest] MediaRecorder construction failed', err);
			error = t.audio.test.recordingUnsupported;
			return;
		}
		recorder.ondataavailable = (e) => {
			if (e.data && e.data.size > 0) recordedChunks.push(e.data);
		};
		recorder.onstop = () => {
			const blob = new Blob(recordedChunks, { type: recorder?.mimeType ?? 'audio/webm' });
			recordedUrl = URL.createObjectURL(blob);
			recordedChunks = [];
			// Stopping the recorder doesn't stop the capture: back to live.
			if (phase === 'recording') phase = 'live';
		};
		recorder.start();
		phase = 'recording';
		recordTimeout = setTimeout(stopRecording, MAX_RECORD_MS);
	}

	function stopRecording() {
		if (recordTimeout) {
			clearTimeout(recordTimeout);
			recordTimeout = null;
		}
		if (recorder && recorder.state !== 'inactive') {
			try { recorder.stop(); } catch {}
		}
	}

	// Everything here is imperative and outlives a render, so teardown is the
	// hook's own: the panel unmounting must release the microphone.
	$effect(() => () => {
		stop();
		clearRecording();
	});

	return {
		get phase() { return phase; },
		get recording() { return phase === 'recording'; },
		get error() { return error; },
		get recordedUrl() { return recordedUrl; },
		/** 0–100, for the meter's width. */
		get levelPercent() { return Math.round(level * 100); },

		start,
		stop,
		record,
		stopRecording,
	};
}
