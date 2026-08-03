<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'default' | 'mention';
		children: Snippet;
	}

	let { variant = 'default', children }: Props = $props();
</script>

<span class="badge body-xs fw-semibold badge-{variant}">
	{@render children()}
</span>

<style>
	.badge {
		padding: 2px 6px;
		border-radius: var(--radius-full);
		min-width: 20px;
		text-align: center;
		display: inline-block;
	}

	.badge-default {
		background: var(--c-bg-4);
		color: var(--c-text-muted);
	}

	.badge-mention {
		background: var(--c-accent);
		color: var(--c-text-inverse);
	}
</style>
