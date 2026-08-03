<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';

	interface Props extends HTMLInputAttributes {
		value?: string;
		el?: HTMLInputElement | null;
		icon?: Snippet;
		trailing?: Snippet;
		/** Any CSS border-radius value, e.g. `var(--radius-md)` or `8px 8px 0 0`. */
		radius?: string;
	}

	// `radius` is pulled out of `rest` on purpose — anything left in `rest` is
	// spread onto the <input>, where it would land as an invalid attribute.
	let {
		type = 'text',
		value = $bindable(''),
		el = $bindable(null),
		icon,
		trailing,
		radius = 'var(--radius-full)',
		...rest
	}: Props = $props();
</script>

<div class="input-wrapper" class:has-icon={icon} style:--input-radius={radius}>
	{#if icon}
		<span class="input-icon text-faint">{@render icon()}</span>
	{/if}
	<input class="input body-sm" {type} bind:value bind:this={el} {...rest} />
	{#if trailing}
		<span class="input-trailing text-faint">{@render trailing()}</span>
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.input-wrapper {
		display: flex;
		align-items: center;
		width: 100%;
		height: var(--input-h);
		padding: var(--sp-2) var(--sp-4);
		border-radius: var(--input-radius);
		transition: border-color var(--duration-fast) var(--ease-default);
		cursor: text;

		@include glass;
	}

	.input-wrapper:focus-within {
		border-color: var(--c-accent-hover-opacity);
	}

	.input-wrapper:has(.input:disabled) {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.input-icon {
		display: flex;
		margin-bottom: 1px;
	}

	.has-icon {
		gap: var(--sp-2);
	}

	.input-trailing {
		display: flex;
		flex-shrink: 0;
	}

	.input {
		flex: 1;
		min-width: 0;
		color: inherit;
		background: none;
		border: none;
		outline: none;
		padding: 0;
	}

	.input::placeholder {
		color: var(--c-text-faint);
	}
</style>
