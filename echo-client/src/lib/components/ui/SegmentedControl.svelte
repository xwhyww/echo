<script lang="ts">
	// A row of mutually exclusive choices rendered as one joined control — for
	// settings where the options are few enough to show at once.
	interface Props {
		options: { value: string; label: string }[];
		value: string;
		onchange: (value: string) => void;
		disabled?: boolean;
		/** Announced as the group's name, since the segments alone don't say what they set. */
		label?: string;
	}

	let { options, value, onchange, disabled = false, label }: Props = $props();
</script>

<div class="segmented" role="group" aria-label={label}>
	{#each options as opt (opt.value)}
		<button
			type="button"
			class="segment body-sm fw-medium text-muted"
			class:active={value === opt.value}
			onclick={() => onchange(opt.value)}
			aria-pressed={value === opt.value}
			{disabled}
		>
			{opt.label}
		</button>
	{/each}
</div>

<style>
	.segmented {
		display: flex;
		border-radius: var(--radius-md);
		overflow: hidden;
		border: 1px solid var(--c-border);
	}

	.segment {
		flex: 1;
		padding: var(--sp-3) var(--sp-4);
		background: var(--c-bg-2);
		border: none;
		border-right: 1px solid var(--c-border);
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-default),
			color var(--duration-fast) var(--ease-default);
	}

	.segment:last-child {
		border-right: none;
	}

	.segment:hover:not(:disabled) {
		background: var(--c-bg-3);
		color: var(--c-accent-text);
	}

	.segment.active,
	.segment.active:hover:not(:disabled) {
		background: var(--c-accent);
		color: var(--c-text-inverse);
	}

	.segment:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
