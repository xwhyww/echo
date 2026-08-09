<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends HTMLButtonAttributes {
		variant?: 'default' | 'danger' | 'glass';
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'm';
		children: Snippet;
	}

	let { variant = 'default', size = 'md', children, ...rest }: Props = $props();
</script>

<button class="btn-icon btn-icon-{variant} btn-icon-{size} text-faint" {...rest}>
	{@render children()}
</button>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;
	
	.btn-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		cursor: pointer;
		transition:
			color var(--duration-fast) var(--ease-default),
			background var(--duration-fast) var(--ease-default);
	}

	.btn-icon:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	
	.btn-icon-glass {
		@include glass;
		border-radius: var(--radius-full);
	}

	/* Sizes */
	/* xs is for dense inline rows (list-row actions, chip affordances) where a
	   32px target would break the row's rhythm. */
	.btn-icon-xs {
		min-width: 28px;
		min-height: 28px;
	}

	.btn-icon-sm {
		min-width: 36px;
		min-height: 36px;
	}

	.btn-icon-md {
		min-width: 44px;
		min-height: 44px;
	}
	
	.btn-icon-m {
		min-width: 48px;
		min-height: 48px;
	}

	.btn-icon-lg {
		min-width: 52px;
		min-height: 52px;
	}
</style>
