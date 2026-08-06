<script lang="ts">
	import { ArrowLeft, Maximize, Minimize } from 'lucide-svelte';
	import { type VoiceScreenShare } from '$lib/stores/voiceClient.svelte.js';
	import ScreenShareAudioControl from '$lib/components/voice/ScreenShareAudioControl.svelte';
	import { useAttachedTrack } from '$lib/hooks/voice/useAttachedTrack.svelte.js';
	import { useFullscreen } from '$lib/hooks/ui/useFullscreen.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		share: VoiceScreenShare;
		// When false (single share), the tile caps its own size against the
		// viewport so it stays a centered 16:9 box. When true, the parent grid
		// owns the sizing and we drop the caps entirely.
		inGrid?: boolean;
		// Set when the tile should be clickable (grid mode → focus this tile).
		onclick?: () => void;
		// Set when the focused tile should render a back button to return to
		// the grid. Mutually exclusive with onclick in practice.
		onback?: () => void;
	}

	const { share, inGrid = false, onclick, onback }: Props = $props();

	let videoEl: HTMLVideoElement | null = $state(null);
	let tileEl: HTMLDivElement | null = $state(null);

	useAttachedTrack(() => videoEl, () => share.track);

	const fullscreen = useFullscreen(() => tileEl);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={tileEl}
	class="screen-tile"
	class:in-grid={inGrid}
	class:clickable={!!onclick}
	class:fullscreen={fullscreen.active}
	onclick={onclick}
	role={onclick ? 'button' : undefined}
	tabindex={onclick ? 0 : undefined}
>
	<!-- muted: the local preview must never play screen audio back to the user.
	     For remote shares LiveKit publishes ScreenShareAudio separately, which
	     is handled by the existing audio path — this element handles video only. -->
	<!-- svelte-ignore a11y_media_has_caption -->
	<video bind:this={videoEl} autoplay playsinline muted></video>

	{#if onback}
		<button
			type="button"
			class="screen-tile-back body-xs"
			onclick={(e) => { e.stopPropagation(); onback(); }}
			aria-label={t.voice.screenTile.backToAll}
			title={t.voice.screenTile.backToAll}
		>
			<ArrowLeft size={18} />
			<span>{t.common.back}</span>
		</button>
	{/if}

	<button
		type="button"
		class="screen-tile-fullscreen"
		onclick={(e) => { e.stopPropagation(); void fullscreen.toggle(); }}
		aria-label={fullscreen.active ? t.voice.screenTile.exitFullscreen : t.voice.screenTile.enterFullscreen}
		title={fullscreen.active ? t.voice.screenTile.exitFullscreen : t.voice.screenTile.fullscreen}
	>
		{#if fullscreen.active}
			<Minimize size={18} />
		{:else}
			<Maximize size={18} />
		{/if}
	</button>

	<!-- Watcher-only: a presenter sharing their own screen gets no audio toggle
	     (they manage shared audio at the source, and a local mute would only
	     silence their own preview). -->
	{#if share.hasAudio && !share.isLocal}
		<ScreenShareAudioControl identity={share.identity} name={share.name} />
	{/if}

	<div class="screen-tile-label body-xs">
		<span class="dot"></span>
		<span class="name">{share.name}{share.isLocal ? t.common.youSuffix : ''}</span>
		<span class="badge body-xxs overline text-inverse">{t.voice.screenTile.screen}</span>
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/button.mixin' as *;
	@use '$lib/styles/layout.mixin' as *;

	.screen-tile {
		position: relative;
		background: #000;
		border: 1px solid var(--c-border);
		border-radius: var(--radius-md);
		overflow: hidden;
		aspect-ratio: 16 / 9;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
	}

	/* Single-share mode: available vertical space = viewport − vc-header
	 * (~32px) − vc-controls (48px button + sp-4 padding-top + border ≈ 64px)
	 * − vc-page padding + gaps (sp-6 × 4 = 96px). Cap height to that and
	 * derive max-width from the 16:9 ratio so the tile fits both axes and
	 * stays centered without stretching to the full container width. */
	.screen-tile:not(.in-grid) {
		max-height: calc(100vh - 64px - 32px - var(--sp-6) * 4);
		max-width: calc((100vh - 64px - 32px - var(--sp-6) * 4) * 16 / 9);
	}

	.screen-tile.clickable {
		cursor: pointer;
		transition: border-color var(--duration-fast) var(--ease-default);
	}

	.screen-tile-back {
		@include video-overlay-button;
		position: absolute;
		top: var(--sp-2);
		left: var(--sp-2);
		gap: var(--sp-1);
		padding: var(--sp-1) var(--sp-2);
	}

	.screen-tile-fullscreen {
		@include video-overlay-button;
		position: absolute;
		bottom: var(--sp-2);
		right: var(--sp-2);
		width: 28px;
		height: 28px;
		padding: 0;
	}

	/* When the tile itself enters native fullscreen, drop the inherited size
	 * caps and 16:9 aspect-ratio so the video fills the entire screen. */
	.screen-tile.fullscreen {
		max-height: none;
		max-width: none;
		width: 100vw;
		height: 100vh;
		aspect-ratio: auto;
		border: none;
		border-radius: 0;
	}

	video {
		width: 100%;
		height: 100%;
		object-fit: contain;
		background: #000;
		display: block;
	}

	.screen-tile-label {
		@include video-overlay-chip;
		position: absolute;
		left: var(--sp-2);
		bottom: var(--sp-2);
		gap: var(--sp-2);
		padding: var(--sp-1) var(--sp-2);
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		/* The live-share dot: a red of its own, not the error red — it means
		   "on air", and it sits on video rather than on a surface. */
		background: #ef4444;
	}

	.badge {
		padding: 1px 6px;
		border-radius: var(--radius-sm);
		background: var(--c-accent);
	}
</style>
