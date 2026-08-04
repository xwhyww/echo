<script lang="ts">
	import { X } from 'lucide-svelte';
	import AudioVolumeControl from '$lib/components/audio/AudioVolumeControl.svelte';
	import PlayPauseButton from '$lib/components/audio/PlayPauseButton.svelte';
	import ProgressTrack from '$lib/components/ui/ProgressTrack.svelte';
	import Waveform from '$lib/components/audio/Waveform.svelte';
	import { audioPlayer } from '$lib/stores/audioPlayer.svelte.js';
	import { formatDuration } from '$lib/utils/voiceRecording.js';
	import {
		downsamplePeaks,
		latencyProgress,
		latencySeekTarget,
		seekRatio,
	} from '$lib/utils/audioPlayback.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// Which edge the bar stack docked us against. Only affects the direction the
	// volume popover opens — the stack owns the actual placement.
	let { dockTop = false }: { dockTop?: boolean } = $props();

	const SPEEDS = [1, 1.5, 2] as const;

	// Tune this if the perceived gap between bar and sound changes on a different
	// setup; what it compensates for is explained in `latencyProgress`.
	const PLAYBACK_LATENCY_S = 0.5;
	const DISPLAY_BAR_COUNT = 32;

	const progress = $derived(
		latencyProgress(audioPlayer.currentTime, audioPlayer.duration, PLAYBACK_LATENCY_S),
	);
	const displayPeaks = $derived(
		downsamplePeaks(audioPlayer.current?.peaks ?? [], DISPLAY_BAR_COUNT),
	);

	function handleScrub(e: MouseEvent) {
		audioPlayer.seek(
			latencySeekTarget(seekRatio(e), audioPlayer.duration, PLAYBACK_LATENCY_S),
		);
	}

	function cycleSpeed() {
		const idx = SPEEDS.indexOf(audioPlayer.speed as 1 | 1.5 | 2);
		audioPlayer.setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
	}
</script>

{#if audioPlayer.current}
	<div class="player-bar">
		<div class="upper">
			<PlayPauseButton size="sm" playing={audioPlayer.playing} onclick={() => audioPlayer.toggle()} />

			<span class="time body-xs text-muted">{formatDuration(audioPlayer.currentTime)}</span>

			{#if displayPeaks.length > 0}
				<Waveform peaks={displayPeaks} {progress} onseek={handleScrub} height="18px" grow />
			{:else}
				<!-- Uploaded audio ships no waveform, so show a plain seekable track. -->
				<ProgressTrack {progress} onseek={handleScrub} height="18px" grow />
			{/if}

			<span class="time body-xs text-muted">{formatDuration(audioPlayer.duration)}</span>

			<button
				type="button"
				class="speed body-xs fw-medium {audioPlayer.speed === 1 ? 'text-muted' : 'text-default'}"
				class:active={audioPlayer.speed !== 1}
				onclick={cycleSpeed}
				aria-label={t.chat.playbackSpeed}
			>
				{audioPlayer.speed}×
			</button>

			<AudioVolumeControl {dockTop} />

			<button type="button" class="icon-btn text-muted" onclick={() => audioPlayer.close()} aria-label={t.chat.closePlayer}>
				<X size={18} />
			</button>
		</div>
	</div>
{/if}

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.player-bar {
		/* Placement is the bar stack's job (see AppBars.svelte); this only needs
		 * to fill the width it's given. */
		display: flex;
		flex-direction: column;
		padding: var(--sp-2) var(--sp-2);

		position: relative;
		width: 100%;

		border-radius: var(--radius-full);

		@include glass;

		.upper {
			display: flex;
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			gap: 10px;
		}
	}

	.time {
		font-variant-numeric: tabular-nums;
		flex-shrink: 0;
	}

	.speed {
		background: none;
		border: 1px solid transparent;
		padding: 2px 8px;
		border-radius: 999px;
		cursor: pointer;
		width: 40px;
		transition:
			background var(--duration-fast) var(--ease-default),
			border-color var(--duration-fast) var(--ease-default),
			color var(--duration-fast) var(--ease-default);
	}

	.speed.active {
		background: var(--c-bg-3);
		@include glass-less;
	}

	.icon-btn {
		background: none;
		border: none;
		padding: var(--sp-1);
		border-radius: var(--radius-sm);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			background var(--duration-fast) var(--ease-default),
			color var(--duration-fast) var(--ease-default);
	}
</style>
