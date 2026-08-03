<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Loader } from 'lucide-svelte';

	interface Props {
		/** The label beside the spinner. Omit it for a bare spinner. */
		children?: Snippet;
		size?: number;
	}

	let { children, size = 12 }: Props = $props();
</script>

<p class="loading body-sm text-faint" role="status" aria-live="polite">
	<span class="loading-icon text-faint"><Loader {size} /></span>
	{#if children}{@render children()}{/if}
</p>

<style>
	.loading {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		margin: 0;
	}

	.loading-icon {
		display: inline-flex;
		flex-shrink: 0;
		animation: loading-spin 1s linear infinite;
	}

	@keyframes loading-spin {
		to { transform: rotate(360deg); }
	}

	@media (prefers-reduced-motion: reduce) {
		.loading-icon {
			animation: none;
		}
	}
</style>
