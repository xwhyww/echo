<script lang="ts">
	import Loading from '$lib/components/ui/Loading.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// The foot of a paginated list: an element that asks for the next page as
	// soon as it comes into view. Render it only while there *is* a next page.
	interface Props {
		loading: boolean;
		onload: () => void;
		/** How far ahead of the viewport to start fetching. */
		rootMargin?: string;
	}

	let { loading, onload, rootMargin = '200px' }: Props = $props();

	let sentinel = $state<HTMLElement | null>(null);

	$effect(() => {
		const el = sentinel;
		if (!el) return;
		// `loading` is read inside the callback rather than here, so a fetch
		// starting doesn't tear down and rebuild the observer mid-scroll.
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting) && !loading) onload();
			},
			{ rootMargin },
		);
		observer.observe(el);
		return () => observer.disconnect();
	});
</script>

<div class="load-more" bind:this={sentinel}>
	{#if loading}
		<Loading>{t.common.loadingMore}</Loading>
	{/if}
</div>

<style>
	.load-more {
		min-height: 24px;
		display: flex;
		justify-content: center;
		padding: var(--sp-3) 0;
	}
</style>
