<script lang="ts">
	import { Mic, MicOff, CircleDot, Square, Play, Loader } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { meterPosition, useMicTest } from '$lib/hooks/audio/useMicTest.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		// When set, the test meter draws a vertical line at this dBFS so the
		// user can pick a sensitivity threshold visually (their speech should
		// reliably crest the line; idle noise should sit below it).
		sensitivityEnabled?: boolean;
		sensitivityThresholdDb?: number;
	}

	const { sensitivityEnabled = false, sensitivityThresholdDb = -45 }: Props = $props();

	const mic = useMicTest();

	// The element only exists once a recording does, so it has to be state.
	let playbackEl = $state<HTMLAudioElement | null>(null);

	const thresholdPercent = $derived(
		sensitivityEnabled ? Math.round(meterPosition(sensitivityThresholdDb) * 100) : null,
	);

	function play() {
		if (!playbackEl) return;
		playbackEl.currentTime = 0;
		playbackEl.play().catch((err) => console.warn('[VoiceTestPanel] play failed', err));
	}
</script>

<div class="vt">
	<div class="vt-row">
		{#if mic.phase === 'idle'}
			<Button variant="primary" onclick={mic.start}>
				<Mic size={14} />
				<span>{t.audio.test.start}</span>
			</Button>
		{:else if mic.phase === 'starting'}
			<Button variant="secondary" disabled>
				<Loader size={14} />
				<span>{t.audio.test.starting}</span>
			</Button>
		{:else}
			<Button variant="secondary" onclick={mic.stop}>
				<MicOff size={14} />
				<span>{t.audio.test.stop}</span>
			</Button>
			{#if mic.recording}
				<Button variant="ghost" onclick={mic.stopRecording}>
					<Square size={14} />
					<span>{t.audio.test.stopRecording}</span>
				</Button>
			{:else}
				<Button variant="ghost" onclick={mic.record}>
					<CircleDot size={14} />
					<span>{t.audio.test.record}</span>
				</Button>
			{/if}
			{#if mic.recordedUrl}
				<Button variant="ghost" onclick={play}>
					<Play size={14} />
					<span>{t.audio.test.playBack}</span>
				</Button>
			{/if}
		{/if}
	</div>

	{#if mic.phase !== 'idle'}
		<div
			class="meter"
			aria-label={t.audio.test.levelAria}
			aria-valuenow={mic.levelPercent}
			role="meter"
		>
			<div
				class="meter-fill"
				style="width: {mic.levelPercent}%"
				class:hot={mic.levelPercent > 85}
			></div>
			{#if thresholdPercent !== null}
				<div
					class="threshold"
					style="left: {thresholdPercent}%"
					title={t.audio.sensitivityThresholdTitle(sensitivityThresholdDb)}
				></div>
			{/if}
		</div>
		<p class="hint body-xs text-faint lh-base">
			{mic.recording ? t.audio.test.recordingHint : t.audio.test.speakHint}
		</p>
	{/if}

	{#if mic.error}
		<p class="error body-xs text-error">{mic.error}</p>
	{/if}

	{#if mic.recordedUrl}
		<audio bind:this={playbackEl} src={mic.recordedUrl} preload="auto"></audio>
	{/if}
</div>

<style>
	.vt {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.vt-row {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.meter {
		position: relative;
		height: 10px;
		width: 100%;
		background: var(--c-bg-3);
		border-radius: 999px;
		overflow: hidden;
	}

	.meter-fill {
		height: 100%;
		background: var(--c-accent);
		transition:
			width 60ms linear,
			background 120ms linear;
	}

	.meter-fill.hot {
		background: var(--c-error);
	}

	/* The sensitivity threshold, drawn across the meter: speech should crest it,
	   idle noise should stay under. */
	.threshold {
		position: absolute;
		top: -2px;
		bottom: -2px;
		width: 2px;
		background: var(--c-text);
		transform: translateX(-50%);
		pointer-events: none;
	}

	.hint,
	.error {
		margin: 0;
	}
</style>
