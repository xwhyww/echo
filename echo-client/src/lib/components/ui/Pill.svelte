<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** The pill's label. */
		children: Snippet;
		/** Optional leading glyph, rendered before the label. */
		icon?: Snippet;
	}

	let { children, icon }: Props = $props();
</script>

<span class="pill body-xxs overline text-muted">
	{#if icon}
		<span class="pill-icon text-muted text-faint">{@render icon()}</span>
	{/if}
	{@render children()}
</span>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border-radius: var(--radius-full);
		@include glass;
	}

	.pill-icon {
		display: inline-flex;
		flex-shrink: 0;
	}
</style>
