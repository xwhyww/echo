<script lang="ts">
	import AudioMeta from '$lib/components/audio/AudioMeta.svelte';
	import PlayPauseButton from '$lib/components/audio/PlayPauseButton.svelte';
	import Waveform from '$lib/components/audio/Waveform.svelte';
	import { useTrackPlayback } from '$lib/hooks/audio/useTrackPlayback.svelte.js';

	// A recorded voice message: it ships its own waveform, so it draws one.
	// An uploaded audio file has no peaks and uses AudioAttachment instead.
	interface Props {
		id: string;
		url: string;
		duration: number;
		peaks: number[];
		size?: number;
		own?: boolean;
		authorName?: string;
	}

	let { id, url, duration, peaks, size, own = false, authorName }: Props = $props();

	const player = useTrackPlayback(() => ({ id, url, duration, peaks, authorName }));
</script>

<div class="voice">
	<PlayPauseButton playing={player.playing} onclick={player.toggle} {own} />

	<div class="middle">
		<Waveform {peaks} progress={player.progress} onseek={player.seek} {own} />
		<AudioMeta seconds={player.displayTime} {size} {own} />
	</div>
</div>

<style>
	.voice {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-width: 180px;
		max-width: 260px;
		padding: 1px 0;
	}

	.middle {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
</style>
