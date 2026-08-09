import {
	startRecording,
	formatDuration,
	MAX_DURATION_MS,
	type RecorderHandle,
	type VoiceRecording,
} from '$lib/utils/voiceRecording.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';

/**
 * Recording a voice message: the recorder handle, the animation frame that
 * drives the live waveform, and the three ways a recording ends — sent, too
 * short, thrown away.
 *
 * Split out of the component because the recording is drawn in two places that
 * are no longer siblings: the strip with the waveform lives inside the composer
 * pill, while the button that starts and finishes it sits outside, to the right
 * of it. Two views, one recording — so the recording cannot belong to either.
 */

/** How many bars fit in the strip. The buffer slides so the newest are visible. */
const VISIBLE_BARS = 60;

/**
 * The recorder reports RMS energy on a 0..127 scale (see `voiceRecording.ts`):
 * room noise lands at ~0.5–1.5, conversational speech at 10+, a shout past 30.
 * Scaling to the local maximum would stretch ambient mic hiss into something
 * that looks like shouting, so the denominator is fixed and everything under
 * the floor is flattened.
 */
const FULL_SCALE_DEVIATION = 24;
const NOISE_FLOOR = 1.5;
/** Silent bars still read as a baseline rather than vanishing. */
const MIN_BAR_PCT = 12;

export function useVoiceRecording(opts: {
	onsend?: (recording: VoiceRecording) => void;
	onerror?: (message: string) => void;
	/** Fires on both edges so the composer can swap the editor for the strip. */
	onactive?: (active: boolean) => void;
}) {
	let handle: RecorderHandle | null = null;
	let recording = $state(false);
	let elapsedMs = $state(0);
	let livePeaks = $state<number[]>([]);
	let level = $state(0);
	let frameId: number | null = null;

	const elapsedLabel = $derived(formatDuration(elapsedMs / 1000));

	/** Bar heights in percent, oldest first, left-padded to a full strip. */
	const bars = $derived.by(() => {
		const slice = livePeaks.slice(-VISIBLE_BARS);
		const padded: number[] = new Array(Math.max(0, VISIBLE_BARS - slice.length)).fill(0);
		return padded.concat(slice).map((p) => {
			const damped = p < NOISE_FLOOR ? 0 : p - NOISE_FLOOR;
			return Math.max(MIN_BAR_PCT, Math.min(100, (damped / FULL_SCALE_DEVIATION) * 100));
		});
	});

	function stopFrame() {
		if (frameId !== null) cancelAnimationFrame(frameId);
		frameId = null;
	}

	function tick() {
		if (!handle) return;
		elapsedMs = handle.getElapsedMs();
		livePeaks = [...handle.getLivePeaks()];
		level = handle.getLevel();

		if (elapsedMs >= MAX_DURATION_MS) {
			void send();
			return;
		}
		frameId = requestAnimationFrame(tick);
	}

	async function start() {
		if (recording) return;
		try {
			handle = await startRecording();
			recording = true;
			elapsedMs = 0;
			livePeaks = [];
			opts.onactive?.(true);
			frameId = requestAnimationFrame(tick);
		} catch (e) {
			handle = null;
			opts.onerror?.(
				e instanceof Error && e.name === 'NotAllowedError'
					? i18n.t.chat.micDenied
					: i18n.t.chat.recordStartFailed,
			);
		}
	}

	async function send() {
		if (!handle) return;
		stopFrame();
		const r = handle;
		handle = null;
		recording = false;
		opts.onactive?.(false);
		try {
			const result = await r.stop();
			// Telegram drops sub-second recordings as accidental; so do we.
			if (result.durationSec < 0.5) {
				opts.onerror?.(i18n.t.chat.recordTooShort);
				return;
			}
			opts.onsend?.(result);
		} catch (e) {
			opts.onerror?.(e instanceof Error ? e.message : i18n.t.chat.recordFailed);
		}
	}

	function cancel() {
		if (!handle) return;
		stopFrame();
		handle.cancel();
		handle = null;
		recording = false;
		elapsedMs = 0;
		livePeaks = [];
		opts.onactive?.(false);
	}

	/** For the owner's `onDestroy`: navigating away must not leave the mic hot. */
	function dispose() {
		if (handle) handle.cancel();
		stopFrame();
	}

	return {
		get recording() { return recording; },
		get elapsedLabel() { return elapsedLabel; },
		get level() { return level; },
		get bars() { return bars; },
		start,
		send,
		cancel,
		dispose,
	};
}

export type VoiceRecordingController = ReturnType<typeof useVoiceRecording>;
