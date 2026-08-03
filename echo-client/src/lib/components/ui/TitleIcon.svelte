<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** The title text. */
		children: Snippet;
		/** Glyph shown before the title. */
		icon: Snippet;
		/** Any CSS color for the icon; the title keeps the inherited text colour. */
		color?: string;
	}

	let { children, icon, color = 'var(--c-text)' }: Props = $props();
</script>

<div class="title-icon text-default" style:--title-icon-color={color}>
	<span class="title-icon-glyph text-default">{@render icon()}</span>
	<span>{@render children()}</span>
</div>

<style>
	.title-icon {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.title-icon-glyph {
		display: inline-flex;
		flex-shrink: 0;
		color: var(--title-icon-color);
	}
</style>
