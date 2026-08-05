<script lang="ts">
	import type { Snippet } from 'svelte';

	// A page's top-level column: stacked sections, inset from the edges, and
	// pushed clear of the fixed header. The header offset is a prop because how
	// far down a page has to start depends on which bars are above it.
	interface Props {
		children: Snippet;
		/** Any CSS gap value, e.g. `var(--sp-4)`. */
		gap?: string;
		/** Any CSS length; pick the `--header-h-padding-*` step that clears this page's chrome. */
		paddingTop?: string;
		/** Caps the column and centres it — for reading-width pages like lists. */
		maxWidth?: string;
	}

	let {
		children,
		gap = 'var(--sp-4)',
		paddingTop = 'var(--header-h-padding-l)',
		maxWidth,
	}: Props = $props();
</script>

<div
	class="page-column"
	style:--page-gap={gap}
	style:--page-padding-top={paddingTop}
	style:max-width={maxWidth}
>
	{@render children()}
</div>

<style>
	.page-column {
		display: flex;
		flex-direction: column;
		width: 100%;
		margin: 0 auto;
		padding: var(--sp-3);
		padding-top: var(--page-padding-top);
		gap: var(--page-gap);
	}
</style>
