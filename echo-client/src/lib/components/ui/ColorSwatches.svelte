<script lang="ts">
	interface Props {
		/** Pickable colours. Each carries a name so the swatch gets a real label. */
		options: { value: string; label: string }[];
		/** Currently picked colour; `null` when nothing is picked yet. */
		value: string | null;
		/** Announced as the group's name — swatches alone say nothing about what they tint. */
		label: string;
		disabled?: boolean;
		onselect: (value: string) => void;
	}

	let { options, value, label, disabled = false, onselect }: Props = $props();
</script>

<div class="swatches" role="group" aria-label={label}>
	{#each options as c (c.value)}
		<button
			type="button"
			class="swatch"
			class:selected={value === c.value}
			style="background: {c.value}"
			onclick={() => onselect(c.value)}
			{disabled}
			aria-label={c.label}
			aria-pressed={value === c.value}
		></button>
	{/each}
</div>

<style>
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin-left: var(--sp-1);
	}

	.swatch {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 2px solid transparent;
		padding: 0;
		cursor: pointer;
		transition: transform var(--duration-fast) var(--ease-default);
	}
	.swatch.selected {
		border-color: var(--c-text);
		box-shadow: 0 0 0 2px var(--c-surface);
	}
	.swatch:disabled {
		cursor: default;
	}
</style>
