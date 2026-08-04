<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowLeft } from 'lucide-svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		// Explicit destination instead of history.back(): landing on the page
		// directly (deep link, reload) still gives the arrow somewhere to go.
		backHref: string;
		title?: string;
	}

	let { backHref, title = '' }: Props = $props();
</script>

<header class="mobile-header">
	<button class="back-btn text-muted" onclick={() => goto(backHref)} aria-label={t.common.back}>
		<ArrowLeft size={20} />
	</button>
	{#if title}
		<span class="title body-sm fw-medium text-default">{title}</span>
	{/if}
</header>

<style>
	/* Mobile-only counterpart of the floating bottom tab bar: same pill look,
	   pinned to the top edge of the screen. */
	.mobile-header {
		display: none;
	}

	@media (max-width: 767px) {
		.mobile-header {
			position: fixed;
			top: calc(8px + var(--safe-top));
			left: 8px;
			width: calc(100% - 16px);
			z-index: var(--z-sticky);
			display: flex;
			align-items: center;
			gap: var(--sp-2);
			background: var(--c-border);
			padding: var(--sp-2);
			border-radius: 32px;
		}
	}

	.back-btn {
		width: 40px;
		height: 40px;
		flex-shrink: 0;
		border-radius: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			background var(--duration-fast) var(--ease-default),
			color var(--duration-fast) var(--ease-default);
	}
</style>
