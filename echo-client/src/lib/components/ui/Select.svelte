<script lang="ts">
	// A native select in the app's clothes. Native on purpose: the options list
	// is the platform's, which is what people expect from a device picker.
	interface Props {
		options: { value: string; label: string }[];
		value: string;
		onchange: (value: string) => void;
		disabled?: boolean;
		label?: string;
	}

	let { options, value, onchange, disabled = false, label }: Props = $props();
</script>

<select
	class="select body-sm text-default"
	{value}
	{disabled}
	aria-label={label}
	onchange={(e) => onchange((e.currentTarget as HTMLSelectElement).value)}
>
	{#each options as opt (opt.value)}
		<option value={opt.value}>{opt.label}</option>
	{/each}
</select>

<style>
	.select {
		flex: 1;
		min-width: 0;
		padding: var(--sp-2) var(--sp-3);
		background: var(--c-bg-2);
		border: 1px solid var(--c-border);
		border-radius: var(--radius-sm);
	}

	.select:disabled {
		opacity: 0.5;
	}
</style>
