<script lang="ts">
	import BackButton from '$lib/components/ui/BackButton.svelte';
	import { useSwipeBack } from '$lib/hooks/ui/useSwipeBack.svelte.js';

	interface Props {
		// Fallback destination: landing on the page directly (deep link,
		// reload) leaves no history to go back to.
		backHref: string;
		title?: string;
	}

	let { backHref, title = '' }: Props = $props();

	// The touch equivalent of the back button beside it.
	useSwipeBack(() => backHref);
</script>

<header class="app-header">
	<div class="header-back">
		<BackButton {backHref} size={48} />
	</div>
	{#if title}
		<h2 class="title body-base">{title}</h2>
	{/if}
</header>

<style>
	/* The header sits at the very top edge, so on a phone the status bar/notch
	   overlaps it. It keeps its own height and wears the inset as padding — the
	   bar grows taller, the content inside it stays put. */
	.app-header {
		height: calc(var(--header-h) + var(--safe-top));
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--safe-top) var(--sp-2) 0;
		/* Scrim so content scrolling under the header stays legible. */
		background: linear-gradient(
			to bottom,
			rgba(0, 0, 0, 0.9),
			rgba(0, 0, 0, 0.6) 60%,
			rgba(0, 0, 0, 0)
		);
		position: absolute;
		width: 100%;
		top: 0;
		right: 0;
		z-index: 2;
	}

	/* Stretched between the inset and the bottom edge rather than centred on
	   50%, which would measure against the padding box and sit half an inset
	   too high. */
	.header-back {
		position: absolute;
		left: var(--sp-2);
		top: var(--safe-top);
		bottom: 0;
		display: flex;
		align-items: center;
	}

	.title {
		text-align: center;
		width: 100%;
	}
</style>
