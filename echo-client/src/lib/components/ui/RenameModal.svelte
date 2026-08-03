<script lang="ts">
	import { untrack } from 'svelte';
	import { Pencil } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// "Give this thing a different name" — one field, pre-filled and selected.
	// The caller does the saving, since only it knows what's being renamed.
	interface Props {
		title: string;
		/** Current name; pre-selected so typing replaces it. */
		value: string;
		saving?: boolean;
		onclose: () => void;
		onsave: (name: string) => void;
	}

	let { title, value, saving = false, onclose, onsave }: Props = $props();

	// Seeded once: the modal mounts fresh per rename, so later prop changes
	// shouldn't overwrite what the user has typed.
	let draft = $state(untrack(() => value));
	let inputEl = $state<HTMLInputElement | null>(null);

	$effect(() => {
		inputEl?.focus();
		inputEl?.select();
	});

	const unchanged = $derived(draft.trim() === value.trim());

	function close() {
		if (!saving) onclose();
	}

	function submit() {
		const trimmed = draft.trim();
		if (!trimmed || saving) return;
		// Nothing to send if the name came back the same.
		if (unchanged) {
			onclose();
			return;
		}
		onsave(trimmed);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
		else if (e.key === 'Enter' && !saving && draft.trim()) {
			e.preventDefault();
			submit();
		}
	}
</script>

<Modal {title} onclose={close} closeDisabled={saving}>
	{#snippet icon()}<Pencil size={22} />{/snippet}

	<Field label={t.common.name}>
		<Input
			bind:value={draft}
			bind:el={inputEl}
			maxlength={64}
			disabled={saving}
			{onkeydown}
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
		/>
	</Field>

	{#snippet actions()}
		<Button variant="ghost" onclick={close} disabled={saving}>{t.common.cancel}</Button>
		<Button variant="primary" onclick={submit} disabled={saving || !draft.trim()}>
			{saving ? t.common.saving : t.common.saveShort}
		</Button>
	{/snippet}
</Modal>
