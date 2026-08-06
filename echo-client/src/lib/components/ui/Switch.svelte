<script lang="ts">
	// An on/off toggle. Distinct from `Checkbox`, which is for selecting items in
	// a set — this one flips a setting that takes effect immediately.
	interface Props {
		checked: boolean;
		onchange: (checked: boolean) => void;
		disabled?: boolean;
		/** Required when no visible label sits beside the switch. */
		label?: string;
	}

	let { checked, onchange, disabled = false, label }: Props = $props();
</script>

<button
	type="button"
	class="switch"
	class:on={checked}
	onclick={() => onchange(!checked)}
	aria-pressed={checked}
	aria-label={label}
	{disabled}
>
	<span class="switch-thumb"></span>
</button>

<style>
	.switch {
		position: relative;
		flex-shrink: 0;
		width: 44px;
		height: 26px;
		border-radius: var(--radius-full);
		border: none;
		background: var(--c-bg-3);
		cursor: pointer;
		padding: 0;
		transition: background var(--duration-fast) var(--ease-default);
	}

	.switch.on { background: var(--c-accent); }

	.switch:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.switch-thumb {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--c-text);
		transition:
			transform var(--duration-fast) var(--ease-default),
			background var(--duration-fast) var(--ease-default);
	}

	.switch.on .switch-thumb {
		transform: translateX(16px);
		background: var(--c-text-inverse);
	}
</style>
