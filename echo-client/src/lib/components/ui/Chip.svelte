<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from 'lucide-svelte';

	interface Props {
		/** The chip's label. Truncates with an ellipsis when it runs out of room. */
		children: Snippet;
		/** Optional leading content — an avatar or icon. */
		leading?: Snippet;
		/** Supplying this shows the remove button. */
		onremove?: () => void;
		/** Tooltip for the remove button. */
		removeTitle?: string;
		title?: string;
		/** Any CSS width value; caps how far the label can stretch. */
		maxWidth?: string;
	}

	let { children, leading, onremove, removeTitle, title, maxWidth = '220px' }: Props = $props();
</script>

<span class="chip body-xs" {title} style:--chip-max-width={maxWidth}>
	{#if leading}
		<span class="chip-leading">{@render leading()}</span>
	{/if}
	<span class="chip-label">{@render children()}</span>
	{#if onremove}
		<button class="chip-remove text-faint" onclick={onremove} title={removeTitle} aria-label={removeTitle}>
			<X size={12} />
		</button>
	{/if}
</span>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		padding: 3px var(--sp-2) 3px 3px;
		border-radius: var(--radius-full);
		max-width: var(--chip-max-width);
		@include glass;
	}

	.chip-leading {
		display: inline-flex;
		flex-shrink: 0;
	}

	.chip-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chip-remove {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 18px;
		height: 18px;
		border-radius: var(--radius-full);
		background: transparent;
		border: none;
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-default),
			color var(--duration-fast) var(--ease-default);
	}

	.chip-remove:hover {
		background: var(--c-error, #ef4444);
		color: var(--c-text-inverse, #fff);
	}
</style>
