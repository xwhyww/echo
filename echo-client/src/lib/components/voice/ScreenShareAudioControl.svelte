<script lang="ts">
	import { Volume2, VolumeX } from 'lucide-svelte';
	import Slider from '$lib/components/ui/Slider.svelte';
	import { VOICE_VOLUME_MIN, VOICE_VOLUME_MAX } from '$lib/stores/voiceVolumes.svelte.js';
	import { useScreenShareVolume } from '$lib/hooks/voice/useScreenShareVolume.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// A watcher's volume for one shared screen, parked in the corner of its tile:
	// a mute toggle that never moves, and a bar that slides out to the LEFT of it
	// on hover. Only watchers get this — a presenter muting their own tile would
	// silence nothing but their own preview.
	interface Props {
		identity: string;
		/** Presenter's display name, for the slider's label. */
		name: string;
	}

	let { identity, name }: Props = $props();

	const volume = useScreenShareVolume(() => identity);

	// The tile behind this focuses itself on click; nothing in here should.
	function swallow(e: Event) {
		e.stopPropagation();
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- The wrapper is hover-only UX scaffolding and its only handler stops a click
     from reaching the tile; the actual controls (button + slider) are
     keyboard-reachable inside, and reaching them by keyboard opens the bar via
     `:focus-within`. -->
<div class="sta" onclick={swallow} onmousedown={swallow}>
	<div class="sta-bar">
		<div class="sta-slider">
			<Slider
				min={VOICE_VOLUME_MIN}
				max={VOICE_VOLUME_MAX}
				step={0.01}
				value={volume.value}
				oninput={volume.set}
				ariaLabel={t.voice.screenTile.sharedAudioVolume(name)}
			/>
		</div>
		<span class="sta-value body-xs {volume.percent > 100 ? 'text-accent' : 'text-inverse'}">
			{volume.percent}%
		</span>
	</div>

	<button
		type="button"
		class="sta-toggle"
		class:muted={volume.muted}
		onclick={volume.toggleMute}
		aria-label={volume.muted ? t.voice.screenTile.unmuteShared : t.voice.screenTile.muteShared}
		title={volume.muted ? t.voice.screenTile.unmuteShared : t.voice.screenTile.muteShared}
	>
		{#if volume.muted}
			<VolumeX size={18} />
		{:else}
			<Volume2 size={18} />
		{/if}
	</button>
</div>

<style lang="scss">
	@use '$lib/styles/button.mixin' as *;

	/* Anchored to the left of the tile's fullscreen button (28px + a gap), and
	 * growing leftward as the bar reveals itself, so the toggle — the thing the
	 * pointer is aiming at — stays welded in place. */
	.sta {
		position: absolute;
		bottom: var(--sp-2);
		right: calc(var(--sp-2) + 28px + var(--sp-1));
		display: flex;
		align-items: center;
		gap: var(--sp-1);
	}

	.sta-toggle {
		@include video-overlay-button;
		width: 28px;
		height: 28px;
		padding: 0;
		flex-shrink: 0;
	}

	.sta-toggle.muted {
		background: rgba(239, 68, 68, 0.75);
	}

	.sta-toggle.muted:hover {
		background: rgba(239, 68, 68, 0.9);
	}

	.sta-bar {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		border-radius: var(--radius-sm);
		max-width: 0;
		padding: 0;
		overflow: hidden;
		opacity: 0;
		pointer-events: none;
		transition:
			max-width var(--duration-base) var(--ease-default),
			opacity var(--duration-base) var(--ease-default),
			padding var(--duration-base) var(--ease-default);
	}

	.sta:hover .sta-bar,
	.sta:focus-within .sta-bar {
		max-width: 200px;
		opacity: 1;
		pointer-events: auto;
	}

	/* Over a dark video tile: lift the track and thumb off black with a
	 * translucent-white track and a solid white thumb. */
	.sta-slider {
		width: 100px;
		display: flex;
		align-items: center;
		--slider-track: rgba(255, 255, 255, 0.25);
		--slider-fill: var(--c-accent-text);
		--slider-thumb: #fff;
		--slider-thumb-size: 12px;
		--slider-thickness: 5px;
	}

	.sta-value {
		min-width: 36px;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
</style>
