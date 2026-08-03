<script lang="ts">
	import { Check } from 'lucide-svelte';

	// The round tick beside a message while the list is in selection mode.
	// Not `Checkbox`: that one is a real `<input>` with a label, for forms. This
	// is a marker — the whole row is the hit target, and it carries no label.
	let { checked = false }: { checked?: boolean } = $props();
</script>

<div class="mark" class:checked class:text-inverse={checked}>
	{#if checked}
		<Check size={12} strokeWidth={3} />
	{/if}
</div>

<style>
	.mark {
		width: 20px;
		height: 20px;
		border-radius: var(--radius-full);
		border: 2px solid var(--c-text-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: all var(--duration-fast) var(--ease-default);
	}

	.mark.checked {
		background: var(--c-accent);
		border-color: var(--c-accent-solid);
	}
</style>
