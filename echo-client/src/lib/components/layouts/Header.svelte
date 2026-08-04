<script lang="ts">
	import BackButton from '$lib/components/ui/BackButton.svelte';

	interface Props {
		// Fallback destination: landing on the page directly (deep link,
		// reload) leaves no history to go back to.
		backHref: string;
		title?: string;
	}

	let { backHref, title = '' }: Props = $props();
</script>

<header class="app-header">
	<div class="header-back">
		<BackButton {backHref} size={36} />
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
		background: transparent;
		position: absolute;
		width: 100%;
		top: 0;
		right: 0;
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
