<script lang="ts">
	import type { VoiceRecordingController } from '$lib/hooks/audio/useVoiceRecording.svelte.js';

	// What a recording in flight looks like: how long it has been running, and
	// the waveform of the last few seconds. It fills the composer pill in place
	// of the editor.
	//
	// Neither of the buttons that end a recording is here. They live outside the
	// pill, in the slots the attach and send buttons occupy the rest of the time
	// — discard on the left, send on the right — so the controls that commit or
	// destroy a message keep one position as the composer changes shape.
	interface Props {
		recorder: VoiceRecordingController;
	}

	let { recorder }: Props = $props();
</script>

<div class="recorder-strip">
	<div class="indicator">
		<span class="dot" style="opacity: {0.5 + recorder.level}"></span>
		<span class="time body-sm text-default">{recorder.elapsedLabel}</span>
	</div>
	<div class="bars" aria-hidden="true">
		{#each recorder.bars as height}
			<span class="bar" style="height: {height}%"></span>
		{/each}
	</div>
</div>

<style>
	.recorder-strip {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex: 1;
		min-width: 0;
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
