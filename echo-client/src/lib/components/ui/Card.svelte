<script lang="ts">
	import type { Snippet } from 'svelte';

	// A titled panel on a settings page. `actions` sits opposite the title; the
	// body is a plain column, so callers just drop controls in.
	interface Props {
		title?: string;
		actions?: Snippet;
		/** Tints the border — for the block that deletes or abandons things. */
		tone?: 'default' | 'danger';
		children: Snippet;
	}

	let { title, actions, tone = 'default', children }: Props = $props();
</script>

<section class="card" class:danger={tone === 'danger'}>
	{#if title || actions}
		<div class="card-head">
			{#if title}<h3 class="heading-sm">{title}</h3>{/if}
			{#if actions}<div class="card-actions">{@render actions()}</div>{/if}
		</div>
	{/if}
	{@render children()}
</section>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.card {
		border-radius: var(--radius-md);
		padding: var(--sp-4);
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		@include glass;
	}

	.card.danger {
		border-color: color-mix(in srgb, var(--c-error) 40%, transparent);
	}

	.card-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-3);
	}

	.card-head h3 {
		margin: 0;
	}

	.card-actions {
		display: flex;
		gap: var(--sp-2);
		flex-shrink: 0;
	}
</style>
