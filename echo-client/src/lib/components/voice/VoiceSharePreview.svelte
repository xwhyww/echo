<script lang="ts">
	import { ScreenShare, MicOff } from 'lucide-svelte';
	import { type VoiceScreenShare } from '$lib/stores/voiceClient.svelte.js';
	import { useAttachedTrack } from '$lib/hooks/voice/useAttachedTrack.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		share: VoiceScreenShare;
		// Display name, already suffixed with " (you)" for the local presenter.
		label: string;
		// Mirror the participant's mic state so the preview keeps parity with the
		// avatar tile (which shows a mic-off badge).
		micMuted?: boolean;
		// Open the full-size focused view for this share.
		onwatch: () => void;
	}

	const { share, label, micMuted = false, onwatch }: Props = $props();

	let videoEl: HTMLVideoElement | null = $state(null);

	// The grid unmounts these previews while a share is focused, so the one track
	// is never attached to two elements at once.
	useAttachedTrack(() => videoEl, () => share.track);
</script>

<!-- muted: the preview is video-only. Remote share audio flows through the
     dedicated WebAudio path; we never play a preview's audio back to the user. -->
<!-- svelte-ignore a11y_media_has_caption -->
<video bind:this={videoEl} autoplay playsinline muted></video>

<div class="sp-label body-xs">
	<span class="sp-dot"></span>
	<span class="sp-name">{label}</span>
	{#if micMuted}
		<MicOff size={12} class="sp-mic" />
	{/if}
</div>

<button
	type="button"
	class="sp-watch body-xs text-inverse"
	onclick={(e) => {
		e.stopPropagation();
		onwatch();
	}}
>
	<ScreenShare size={15} />
	<span>{t.voice.watch}</span>
</button>

<style lang="scss">
	@use '$lib/styles/layout.mixin' as *;

	video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		background: #000;
		display: block;
	}

	.sp-label {
		@include video-overlay-chip;
		position: absolute;
		left: var(--sp-2);
		bottom: var(--sp-2);
		gap: var(--sp-1);
		max-width: calc(100% - var(--sp-4));
		padding: 2px var(--sp-2);
	}

	.sp-dot {
		flex-shrink: 0;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #ef4444;
	}

	.sp-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sp-label :global(.sp-mic) {
		flex-shrink: 0;
		color: var(--c-error);
	}

	.sp-watch {
		position: absolute;
		top: var(--sp-2);
		right: var(--sp-2);
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		padding: var(--sp-1) var(--sp-2);
		background: var(--c-accent);
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);
	}
</style>
