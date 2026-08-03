<script lang="ts">
	import { Music } from 'lucide-svelte';
	import AudioMeta from '$lib/components/audio/AudioMeta.svelte';
	import PlayPauseButton from '$lib/components/audio/PlayPauseButton.svelte';
	import ProgressTrack from '$lib/components/ui/ProgressTrack.svelte';
	import { useAudioDuration } from '$lib/hooks/audio/useAudioDuration.svelte.js';
	import { useTrackPlayback } from '$lib/hooks/audio/useTrackPlayback.svelte.js';

	// An uploaded audio file (mp3, m4a, …) rendered as a playable message rather
	// than a file chip. Recorded voice messages use VoiceMessage instead: those
	// ship a precomputed waveform, whereas an arbitrary upload has none, so this
	// shows a seekable progress track and probes the duration from metadata.
	interface Props {
		id: string;
		url: string;
		filename: string;
		size?: number;
		own?: boolean;
		authorName?: string;
	}

	let { id, url, filename, size, own = false, authorName }: Props = $props();

	const probed = useAudioDuration(() => url);

	// No peaks to hand over — the player bar falls back to a plain progress track
	// when the array is empty.
	const player = useTrackPlayback(() => ({
		id,
		url,
		duration: probed.value,
		peaks: [],
		authorName,
	}));
</script>

<div class="audio">
	<PlayPauseButton playing={player.playing} onclick={player.toggle} {own} />

	<div class="middle">
		<div class="title body-xs {own ? 'text-on-accent-muted' : 'text-muted'}">
			<Music size={12} />
			<!-- Inverse rather than the primary ink inside an own bubble: in the
			     light theme `--c-text` is near-black, and the bubble under it is
			     deep blue either way. -->
			<span class="filename {own ? 'text-inverse' : 'text-default'}" title={filename}>{filename}</span>
		</div>
		<ProgressTrack progress={player.progress} onseek={player.seek} {own} />
		<AudioMeta
			seconds={player.displayTime}
			{size}
			{own}
			placeholder={player.duration > 0 ? undefined : '--:--'}
		/>
	</div>
</div>

<style>
	.audio {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-width: 200px;
		max-width: var(--audio-max-w, 280px);
		padding: 1px 0;
	}

	.middle {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.title {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}

	.filename {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
