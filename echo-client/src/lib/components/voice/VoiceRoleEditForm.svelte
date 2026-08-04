<script lang="ts">
	import { untrack } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Checkbox from '$lib/components/ui/Checkbox.svelte';
	import ColorSwatches from '$lib/components/ui/ColorSwatches.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import type { VoiceRole } from '$lib/api/voice.js';
	import {
		hasPermission,
		roleEditPatch,
		togglePermission,
		type PermissionMeta,
		type RoleColorOption,
		type RolePatch,
	} from '$lib/utils/voiceRoles.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// The inline editor for one role. The draft is the form's own — it exists
	// only while the form does, and nothing outside needs to see a half-typed
	// name. What leaves is the diff, once.
	interface Props {
		role: VoiceRole;
		permissionMeta: PermissionMeta[];
		colorOptions: RoleColorOption[];
		/** Resolves when the save has settled; rejection is the caller's to report. */
		onsave: (patch: RolePatch) => Promise<void>;
		oncancel: () => void;
	}

	let { role, permissionMeta, colorOptions, onsave, oncancel }: Props = $props();

	// Seeded once, on open: a WS update landing mid-edit must not overwrite what
	// the user is typing. `untrack` documents that the snapshot is the point.
	let name = $state(untrack(() => role.name));
	let permissions = $state(untrack(() => role.permissions));
	let color = $state<string | null>(untrack(() => role.color));
	let saving = $state(false);

	async function submit() {
		if (saving) return;
		const patch = roleEditPatch(role, { name, permissions, color });
		if (!patch) return;
		// Nothing changed — no request to make, just put the row back.
		if (Object.keys(patch).length === 0) {
			oncancel();
			return;
		}
		saving = true;
		try {
			await onsave(patch);
		} finally {
			saving = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (!saving) oncancel();
		} else if (e.key === 'Enter' && !saving && name.trim()) {
			e.preventDefault();
			void submit();
		}
	}
</script>

<div class="vrp-edit">
	<Input
		bind:value={name}
		maxlength={64}
		disabled={saving}
		onkeydown={onKeydown}
		autocomplete="off"
		autocapitalize="off"
		spellcheck="false"
		radius="var(--radius-md)"
	/>

	<ColorSwatches
		options={colorOptions}
		value={color}
		label={t.voice.roles.roleColor}
		disabled={saving}
		onselect={(c) => (color = c)}
	/>

	<div class="vrp-perms">
		{#each permissionMeta as p (p.bit)}
			{@const PermIcon = p.icon}
			<Checkbox
				checked={hasPermission(permissions, p.bit)}
				onchange={() => (permissions = togglePermission(permissions, p.bit))}
				disabled={saving}
			>
				{#snippet icon()}<PermIcon size={15} />{/snippet}
				{p.label}
			</Checkbox>
		{/each}
	</div>

	<div class="vrp-edit-actions">
		<Button variant="ghost" onclick={oncancel} disabled={saving}>{t.common.cancel}</Button>
		<Button variant="primary" onclick={submit} disabled={saving || !name.trim()}>
			{saving ? t.common.saving : t.common.saveShort}
		</Button>
	</div>
</div>

<style>
	.vrp-edit {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.vrp-perms {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.vrp-edit-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--sp-2);
	}
</style>
