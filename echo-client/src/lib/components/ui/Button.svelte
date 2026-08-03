<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends HTMLButtonAttributes {
		variant?: 'primary' | 'secondary' | 'ghost' | 'dashed' | 'danger' | 'link';
		children: Snippet;
	}

	let { variant = 'primary', children, ...rest }: Props = $props();
</script>

<button class="btn btn-{variant}" {...rest}>
	{@render children()}
</button>

<style lang="scss">
	@use '$lib/styles/button.mixin' as *;

	.btn-primary {
		@include button-primary;
	}

	.btn-secondary {
		@include button-secondary;
	}

	.btn-ghost {
		@include button-ghost;
	}

	.btn-dashed {
		@include button-dashed;
	}

	.btn-danger {
		@include button-danger;
	}

	.btn-link {
		@include button-link;
	}
</style>
