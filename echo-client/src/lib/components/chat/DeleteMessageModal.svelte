<script lang="ts">
	import { Trash2 } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// Not a `confirm()`: the question has three answers, not two — for everyone,
	// for me, or neither. The chrome is the shared modal all the same.
	interface Props {
		count?: number;
		ondelete: (mode: 'for_me' | 'for_everyone') => void;
		onclose: () => void;
	}

	let { count = 1, ondelete, onclose }: Props = $props();
</script>

<Modal title={t.chat.deleteTitle(count)} desc={t.chat.deleteConfirm(count)} {onclose} tone="danger" layout="alert">
	{#snippet icon()}<Trash2 size={22} />{/snippet}

	{#snippet actions()}
		<div class="delete-choices">
			<Button variant="danger" onclick={() => ondelete('for_everyone')}>
				<Trash2 size={14} />
				{t.chat.deleteForEveryone}
			</Button>
			<Button variant="secondary" onclick={() => ondelete('for_me')}>
				{t.chat.deleteForMe}
			</Button>
			<Button variant="ghost" onclick={onclose}>
				{t.common.cancel}
			</Button>
		</div>
	{/snippet}
</Modal>

<style>
	/* Three peers, none of them the obvious default — so they stack full-width
	   instead of sitting in the usual right-aligned row. */
	.delete-choices {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
</style>
