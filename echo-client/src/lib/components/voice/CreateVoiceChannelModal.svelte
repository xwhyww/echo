<script lang="ts">
	import { untrack } from 'svelte';
	import { Volume2 } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import { voiceService } from '$lib/api/voiceService.js';
	import { toasts } from '$lib/stores/toasts.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { VoiceChannel, VoiceCategory } from '$lib/api/voice.js';

	const t = $derived(i18n.t);

	const NO_CATEGORY = '__none__';

	interface Props {
		groupId: string;
		categories: VoiceCategory[];
		/** Pre-selected when the flow started from a category's own menu. */
		presetCategoryId?: string | null;
		onclose: () => void;
		oncreated: (channel: VoiceChannel) => void;
	}

	let { groupId, categories, presetCategoryId = null, onclose, oncreated }: Props = $props();

	// The draft lives and dies with the modal, so there's nothing to reset — and
	// seeding from the preset is deliberately a one-off, hence `untrack`.
	let name = $state('');
	let categoryId = $state<string>(untrack(() => presetCategoryId) ?? NO_CATEGORY);
	let creating = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);

	const categoryOptions = $derived([
		{ value: NO_CATEGORY, label: t.voice.noCategory },
		...categories.map((c) => ({ value: c.id, label: c.name })),
	]);

	// Mounting is opening — this is the moment to take focus.
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
			const { channel } = await voiceService.createChannel({
				groupId,
				name: trimmed,
				categoryId: categoryId === NO_CATEGORY ? null : categoryId,
			});
			oncreated(channel);
			onclose();
		} catch (err) {
			console.error('[CreateVoiceChannelModal] create failed', err);
			toasts.error((err as Error).message ?? t.voice.createChannelFailed);
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

<Modal title={t.voice.newVoiceChannel} desc={t.voice.newChannelDesc} onclose={close}>
	{#snippet icon()}<Volume2 size={22} />{/snippet}

	<Field label={t.common.name}>
		<Input
			bind:value={name}
			bind:el={inputEl}
			placeholder={t.voice.channelNamePlaceholder}
			maxlength={64}
			disabled={creating}
			{onkeydown}
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
		/>
	</Field>

	{#if categories.length > 0}
		<Field label={t.voice.category}>
			<Select
				options={categoryOptions}
				value={categoryId}
				onchange={(v) => (categoryId = v)}
				disabled={creating}
				label={t.voice.category}
			/>
		</Field>
	{/if}

	{#snippet actions()}
		<Button variant="ghost" onclick={close} disabled={creating}>{t.common.cancel}</Button>
		<Button variant="primary" onclick={submit} disabled={creating || !name.trim()}>
			{creating ? t.common.creating : t.voice.createChannel}
		</Button>
	{/snippet}
</Modal>
