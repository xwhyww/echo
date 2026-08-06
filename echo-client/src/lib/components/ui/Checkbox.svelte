<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Two-way bindable, but a one-way `checked={expr}` + `onchange` pair works
		 *  equally well when the source of truth is derived (a bitmask, a Set). */
		checked?: boolean;
		onchange?: (checked: boolean) => void;
		disabled?: boolean;
		/** The label text. Truncates with an ellipsis when it runs out of room. */
		children: Snippet;
		/** Optional glyph between the box and the label. Tints with the checked state. */
		icon?: Snippet;
	}

	let { checked = $bindable(false), onchange, disabled = false, children, icon }: Props = $props();

	function handle(e: Event & { currentTarget: HTMLInputElement }) {
		checked = e.currentTarget.checked;
		onchange?.(checked);
	}
</script>

<label class="checkbox body-xs text-muted" class:checked class:disabled>
	<input type="checkbox" {checked} {disabled} onchange={handle} />
	{#if icon}
		<span class="checkbox-icon text-muted">{@render icon()}</span>
	{/if}
	<span class="checkbox-label text-muted">{@render children()}</span>
</label>

<style>
	.checkbox {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-1) var(--sp-2);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-default),
			color var(--duration-fast) var(--ease-default);
	}

	.checkbox.checked {
		color: var(--c-text);
	}

	.checkbox.disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	/* reset.css pads every input for text fields; a checkbox must not inherit it. */
	.checkbox input {
		flex-shrink: 0;
		margin: 0;
		padding: 0;
		border-radius: 0;
		accent-color: var(--c-accent-solid);
		cursor: inherit;
	}

	.checkbox-icon {
		display: inline-flex;
		flex-shrink: 0;
	}

	.checkbox.checked .checkbox-icon {
		color: var(--c-accent-text);
	}

	.checkbox-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
