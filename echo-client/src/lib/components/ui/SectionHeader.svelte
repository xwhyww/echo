<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Left block — icon, heading, count. */
		title: Snippet;
		/** Right block — buttons. Omit it and the title sits alone. */
		actions?: Snippet;
	}

	let { title, actions }: Props = $props();
</script>

<header class="section-header">
	<div class="section-header-title">{@render title()}</div>
	{#if actions}
		<div class="section-header-actions">{@render actions()}</div>
	{/if}
</header>

<style>
	.section-header {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-bottom: var(--sp-4);
	}

	.section-header-title,
	.section-header-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.section-header-title {
		min-width: 0;
	}

	.section-header-actions {
		flex-shrink: 0;
	}
</style>
