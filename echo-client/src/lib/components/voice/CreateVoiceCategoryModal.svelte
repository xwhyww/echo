<script lang="ts">
	import { FolderOpen } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import { voiceService } from '$lib/api/voiceService.js';
	import { toasts } from '$lib/stores/toasts.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { VoiceCategory } from '$lib/api/voice.js';

	const t = $derived(i18n.t);

	interface Props {
		groupId: string;
		onclose: () => void;
		oncreated: (category: VoiceCategory) => void;
	}

	let { groupId, onclose, oncreated }: Props = $props();

	let name = $state('');
	let creating = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);

	$effect(() => {
		inputEl?.focus();
	});

	function close() {
		if (!creating) onclose();
	}

	async function submit() {
		const trimmed = name.trim();
		if (!trimmed || creating) return;
		creating = true;
		try {
			const { category } = await voiceService.createCategory({ groupId, name: trimmed });
			oncreated(category);
			onclose();
		} catch (err) {
			console.error('[CreateVoiceCategoryModal] create failed', err);
			toasts.error((err as Error).message ?? t.voice.createCategoryFailed);
		} finally {
			creating = false;
		}
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
		else if (e.key === 'Enter' && !creating && name.trim()) {
			e.preventDefault();
			void submit();
		}
	}
</script>

<Modal title={t.voice.newCategory} desc={t.voice.newCategoryDesc} onclose={close}>
	{#snippet icon()}<FolderOpen size={22} />{/snippet}

	<Field label={t.common.name}>
		<Input
			bind:value={name}
			bind:el={inputEl}
			placeholder={t.voice.categoryNamePlaceholder}
			maxlength={64}
			disabled={creating}
			{onkeydown}
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
		/>
	</Field>

	{#snippet actions()}
		<Button variant="ghost" onclick={close} disabled={creating}>{t.common.cancel}</Button>
		<Button variant="primary" onclick={submit} disabled={creating || !name.trim()}>
			{creating ? t.common.creating : t.voice.createCategory}
		</Button>
	{/snippet}
</Modal>
