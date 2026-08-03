<script lang="ts">
	import { Shield } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ColorSwatches from '$lib/components/ui/ColorSwatches.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import { voiceService } from '$lib/api/voiceService.js';
	import { toasts } from '$lib/stores/toasts.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import { DEFAULT_PERMISSIONS, ROLE_COLORS, roleColorOptions } from '$lib/utils/voiceRoles.js';
	import type { VoiceRole } from '$lib/api/voice.js';

	const t = $derived(i18n.t);

	interface Props {
		groupId: string;
		onclose: () => void;
		/** The created role, so the list can show it without waiting for the WS event. */
		oncreated: (role: VoiceRole) => void;
	}

	let { groupId, onclose, oncreated }: Props = $props();

	// The draft lives and dies with the modal, so there's nothing to reset on
	// open and nothing left behind on cancel.
	let name = $state('');
	let color = $state<string>(ROLE_COLORS[0]);
	let creating = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);

	const colorOptions = $derived(roleColorOptions(t));

	// Mounting *is* opening, so this is the moment to take focus.
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
			const { role } = await voiceService.createRole({
				groupId,
				name: trimmed,
				color,
				permissions: DEFAULT_PERMISSIONS,
			});
			oncreated(role);
			onclose();
		} catch (err) {
			console.error('[CreateRoleModal] create failed', err);
			toasts.error((err as Error).message ?? t.voice.roles.createFailed);
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

<Modal title={t.voice.roles.newRole} desc={t.voice.roles.newRoleDesc} onclose={close}>
	{#snippet icon()}<Shield size={22} />{/snippet}
	<Field label={t.common.name}>
		<Input
			bind:value={name}
			bind:el={inputEl}
			placeholder={t.voice.roles.namePlaceholder}
			maxlength={64}
			disabled={creating}
			{onkeydown}
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
		/>
	</Field>
	<Field label={t.voice.roles.color}>
		<ColorSwatches
			options={colorOptions}
			value={color}
			label={t.voice.roles.roleColor}
			disabled={creating}
			onselect={(c) => (color = c)}
		/>
	</Field>
	{#snippet actions()}
		<Button variant="ghost" onclick={close} disabled={creating}>{t.common.cancel}</Button>
		<Button variant="primary" onclick={submit} disabled={creating || !name.trim()}>
			{creating ? t.common.creating : t.voice.roles.createRole}
		</Button>
	{/snippet}
</Modal>
