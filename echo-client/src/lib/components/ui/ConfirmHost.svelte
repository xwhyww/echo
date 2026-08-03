<script lang="ts">
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { confirmPrompt } from '$lib/stores/confirm.svelte.js';

	// Mounted once, in the root layout: renders whatever question `confirm()` is
	// currently waiting on and hands the answer back to the awaiting caller.
	const pending = $derived(confirmPrompt.pending);
	const parts = $derived(
		pending && typeof pending.message === 'object' ? pending.message : null,
	);
</script>

{#if pending}
	<ConfirmDialog
		title={pending.title}
		message={typeof pending.message === 'string' ? pending.message : undefined}
		body={parts ? emphasised : undefined}
		confirmLabel={pending.confirmLabel}
		cancelLabel={pending.cancelLabel}
		tone={pending.tone}
		requireText={pending.requireText ?? null}
		onconfirm={() => confirmPrompt.answer(true)}
		onclose={() => confirmPrompt.answer(false)}
	/>
{/if}

{#snippet emphasised()}
	{#if parts}
		{parts.before}<strong class="fw-semibold">{parts.name}</strong>{parts.after}
	{/if}
{/snippet}

<style>
	strong {
		color: var(--c-text);
	}
</style>
