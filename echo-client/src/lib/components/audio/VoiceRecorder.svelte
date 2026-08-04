<script lang="ts">
	import { Mic, Send, Trash2 } from 'lucide-svelte';
	import { onDestroy } from 'svelte';
	import {
		startRecording,
		formatDuration,
		MAX_DURATION_MS,
		type RecorderHandle,
		type VoiceRecording,
	} from '$lib/utils/voiceRecording';
	import ButtonIcon from '$lib/components/ui/ButtonIcon.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		// Called with the finished recording. Caller wraps it into a File and
		// pushes it through the normal upload pipeline.
		onsend?: (recording: VoiceRecording) => void;
		// Called when permission is denied or recording fails to start. Lets the
		// parent surface a toast.
		onerror?: (message: string) => void;
		// Lifecycle hooks so the parent (TextField) can hide the editor while
		// recording is in flight.
		onactive?: (active: boolean) => void;
	}

	let { onsend, onerror, onactive }: Props = $props();

	let recorder: RecorderHandle | null = null;
	let recording = $state(false);
	let elapsedMs = $state(0);
	let livePeaks = $state<number[]>([]);
	let level = $state(0);
	let frameId: number | null = null;

	// How many bars fit in the recorder strip. We slide the live buffer so the
	// most recent samples are always visible, like Telegram.
	const VISIBLE_BARS = 60;

	const elapsedSec = $derived(elapsedMs / 1000);
	const elapsedLabel = $derived(formatDuration(elapsedSec));

	// The recorder hands us RMS energy on a 0..127 scale (see voiceRecording.ts):
	// room noise lands at ~0.5–1.5, conversational speech at 10+, a shout past 30.
	// Auto-scaling to the local max would stretch ambient mic hiss to look like a
	// shout, so we use this fixed denominator and a noise floor that flattens
	// anything below it.
	const FULL_SCALE_DEVIATION = 24;
	const NOISE_FLOOR = 1.5;
	// Silent bars still read as a waveform baseline rather than vanishing.
	const MIN_BAR_PCT = 12;

	const visibleBars = $derived.by(() => {
		const slice = livePeaks.slice(-VISIBLE_BARS);
		const padded = new Array(Math.max(0, VISIBLE_BARS - slice.length)).fill(0);
		return padded.concat(slice);
	});

	function tick() {
		if (!recorder) return;
		elapsedMs = recorder.getElapsedMs();
		livePeaks = [...recorder.getLivePeaks()];
		level = recorder.getLevel();

		if (elapsedMs >= MAX_DURATION_MS) {
			void send();
			return;
		}
		frameId = requestAnimationFrame(tick);
	}

	export async function start() {
		if (recording) return;
		try {
			recorder = await startRecording();
			recording = true;
			elapsedMs = 0;
			livePeaks = [];
			onactive?.(true);
			frameId = requestAnimationFrame(tick);
		} catch (e) {
			recorder = null;
			const msg = e instanceof Error && e.name === 'NotAllowedError'
				? i18n.t.chat.micDenied
				: i18n.t.chat.recordStartFailed;
			onerror?.(msg);
		}
	}

	export async function send() {
		if (!recorder) return;
		stopFrame();
		const r = recorder;
		recorder = null;
		recording = false;
		onactive?.(false);
		try {
			const result = await r.stop();
			// Skip too-short clips (Telegram drops <1s recordings as accidental).
			if (result.durationSec < 0.5) {
				onerror?.(i18n.t.chat.recordTooShort);
				return;
			}
			onsend?.(result);
		} catch (e) {
			onerror?.(e instanceof Error ? e.message : i18n.t.chat.recordFailed);
		}
	}

	export function cancel() {
		if (!recorder) return;
		stopFrame();
		recorder.cancel();
		recorder = null;
		recording = false;
		elapsedMs = 0;
		livePeaks = [];
		onactive?.(false);
	}

	function stopFrame() {
		if (frameId !== null) cancelAnimationFrame(frameId);
		frameId = null;
	}

	onDestroy(() => {
		if (recorder) recorder.cancel();
		stopFrame();
	});
</script>

{#if recording}
	<div class="recorder-strip">
		<button type="button" class="cancel text-error" onclick={cancel} aria-label={t.chat.cancelRecording}>
			<Trash2 size={18} />
		</button>
		<div class="indicator">
			<span class="dot" style="opacity: {0.5 + level}"></span>
			<span class="time body-sm text-default">{elapsedLabel}</span>
		</div>
		<div class="bars" aria-hidden="true">
			{#each visibleBars as p}
				{@const damped = p < NOISE_FLOOR ? 0 : p - NOISE_FLOOR}
				{@const pct = Math.min(100, (damped / FULL_SCALE_DEVIATION) * 100)}
				<span class="bar" style="height: {Math.max(MIN_BAR_PCT, pct)}%"></span>
			{/each}
		</div>
		<ButtonIcon size="md" title={t.chat.sendVoice} onclick={send}>
			<Send size={20} />
		</ButtonIcon>
	</div>
{:else}
	<ButtonIcon size="md" title={t.chat.recordVoice} onclick={start}>
		<Mic size={20} />
	</ButtonIcon>
{/if}

<style>
	.recorder-strip {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex: 1;
		min-width: 0;
	}

	.cancel {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: none;
		background: transparent;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);
	}

	.cancel:hover {
		background: rgba(224, 72, 72, 0.12);
	}

	.indicator {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-shrink: 0;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--c-error);
		animation: pulse 1.4s var(--ease-default) infinite;
	}

	@keyframes pulse {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.25); }
	}

	.time {
		font-variant-numeric: tabular-nums;
	}

	.bars {
		display: flex;
		align-items: center;
		gap: 2px;
		height: 24px;
		flex: 1;
		min-width: 0;
		overflow: hidden;
	}

	.bar {
		flex: 1;
		min-width: 2px;
		max-width: 3px;
		background: var(--c-accent);
		border-radius: 2px;
		opacity: 0.85;
	}
</style>
