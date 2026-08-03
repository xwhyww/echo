<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends HTMLButtonAttributes {
		variant?: 'default' | 'danger';
		size?: 'xs' | 'sm' | 'md' | 'lg';
		children: Snippet;
	}

	let { variant = 'default', size = 'md', children, ...rest }: Props = $props();
</script>

<button class="btn-icon btn-icon-{variant} btn-icon-{size} text-faint" {...rest}>
	{@render children()}
</button>

<style>
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

	/* Variants */
	@media (hover: hover) {
		.btn-icon:hover {
			background: var(--c-bg-3);
		}
		
		.btn-icon-default:hover {
			color: var(--c-text);
		}
		
		.btn-icon-danger:hover {
			color: var(--c-error);
		}
	}

	/* Sizes */
	/* xs is for dense inline rows (list-row actions, chip affordances) where a
	   32px target would break the row's rhythm. */
	.btn-icon-xs {
		min-width: 24px;
		min-height: 24px;
	}

	.btn-icon-sm {
		min-width: 32px;
		min-height: 32px;
	}

	.btn-icon-md {
		min-width: 40px;
		min-height: 40px;
	}

	.btn-icon-lg {
		min-width: 48px;
		min-height: 48px;
	}
</style>
