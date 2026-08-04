<script lang="ts">
	import { Play, Pause } from 'lucide-svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// The round play/pause control, in the only two sizes there are: the large one
	// a bubble shows, the small one the docked bar shows.
	interface Props {
		playing: boolean;
		onclick: () => void;
		size?: 'sm' | 'md';
		/** Inside an own (accent) bubble, where the surrounding fill is accent already. */
		own?: boolean;
	}

	let { playing, onclick, size = 'md', own = false }: Props = $props();

	const iconSize = $derived(size === 'sm' ? 12 : 14);
</script>

<button
	type="button"
	class="play-btn {size}"
	class:own
	{onclick}
	aria-label={playing ? t.chat.pause : t.chat.play}
>
	{#if playing}
		<Pause size={iconSize} fill="currentColor" />
	{:else}
		<Play size={iconSize} fill="currentColor" />
	{/if}
</button>

<style lang="scss">
	@use '$lib/styles/button.mixin' as *;

	.play-btn {
		@include play-button;
	}

	.play-btn.sm {
		width: 28px;
		height: 28px;
	}

	.play-btn.own {
		@include play-button-own;
	}
</style>
