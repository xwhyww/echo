<script lang="ts">
	import type { Snippet } from 'svelte';
	import Loading from '$lib/components/ui/Loading.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// The three things that can be true before content is worth showing —
	// still fetching, the fetch failed, or it succeeded with nothing in it.
	// Callers pass the wording; the placement and colour live here so every
	// screen reports these the same way.
	interface Props {
		loading: boolean;
		/** Label beside the spinner. Defaults to the generic "Loading…". */
		loadingLabel?: string;
		/** A failed load, already translated. */
		error?: string | null;
		/** What to say when the load succeeded but there's nothing to show.
		    Leave it null on screens that always have content. */
		empty?: string | null;
		children: Snippet;
	}

	let { loading, loadingLabel, error = null, empty = null, children }: Props = $props();
</script>

{#if loading}
	<Loading>{loadingLabel ?? t.common.loading}</Loading>
{:else if error}
	<p class="state body-sm text-error">{error}</p>
{:else if empty}
	<p class="state body-sm text-muted">{empty}</p>
{:else}
	{@render children()}
{/if}

<style>
	.state {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		margin: 0;
	}
</style>
