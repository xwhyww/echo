<script lang="ts">
	import { Plus, Shield } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import LoadState from '$lib/components/ui/LoadState.svelte';
	import VoiceRoleRow from '$lib/components/voice/VoiceRoleRow.svelte';
	import CreateRoleModal from '$lib/components/voice/CreateRoleModal.svelte';
	import RoleMemberPickerModal from '$lib/components/voice/RoleMemberPickerModal.svelte';
	import SectionHeader from '$lib/components/ui/SectionHeader.svelte';
	import { useVoiceRoles } from '$lib/hooks/voice/useVoiceRoles.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		groupId: string;
	}

	let { groupId }: Props = $props();

	const panel = useVoiceRoles(() => groupId);

	// Null once there's a list to show. The second half depends on who's asking:
	// a manager gets told how to create one, everyone else just that there are none.
	const emptyMessage = $derived(
		panel.roles.length === 0
			? `${t.voice.roles.noRolesEmpty} ${panel.canManage ? t.voice.roles.noRolesManager : t.voice.roles.noRolesMember}`
			: null,
	);
</script>

<section>
	<SectionHeader>
		{#snippet title()}
			<Shield size={16} />
			<h2 class="heading-md fw-semibold">{t.voice.roles.title}</h2>
			<span class="vrp-count body-xs">{panel.roles.length}</span>
		{/snippet}
		{#snippet actions()}
			{#if panel.canManage}
				<Button variant="primary" onclick={panel.openCreate} title={t.voice.roles.newRole}>
					<Plus size={14} />
					<span>{t.voice.roles.newRole}</span>
				</Button>
			{/if}
		{/snippet}
	</SectionHeader>

	<LoadState
		loading={panel.loading}
		loadingLabel={t.voice.roles.loadingRoles}
		error={panel.loadError}
		empty={emptyMessage}
	>
		<ul class="vrp-list" class:reordering={panel.reorderSaving}>
			{#each panel.sortedRoles as r (r.id)}
				<VoiceRoleRow
					role={r}
					canManage={panel.canManage}
					permissionMeta={panel.permissionMeta}
					colorOptions={panel.colorOptions}
					editing={panel.editingRoleId === r.id}
					drag={panel.drag}
					onedit={panel.openEdit}
					ondelete={panel.deleteRole}
					oncanceledit={panel.closeEdit}
					onsubmitedit={(patch) => panel.saveEdit(r.id, patch)}
					onaddmember={panel.openMemberPicker}
					onremovemember={panel.removeMember}
				/>
			{/each}
		</ul>
	</LoadState>
</section>

{#if panel.showCreateModal}
	<CreateRoleModal {groupId} onclose={panel.closeCreate} oncreated={panel.addRole} />
{/if}

{#if panel.pickerRole}
	{@const role = panel.pickerRole}
	<RoleMemberPickerModal
		{role}
		members={panel.groupMembers}
		loading={panel.loadingMembers}
		onclose={panel.closeMemberPicker}
		onadded={(m) => panel.addMember(role.id, m)}
	/>
{/if}

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;
	@use '$lib/styles/layout.mixin' as *;

	.vrp-count {
		border-radius: var(--radius-full);
		width: var(--count-badge-size);
		height: var(--count-badge-size);
		@include flex-center;
		@include glass-less;
	}

	.vrp-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	/* Killed while a reorder PATCH is in flight so a second drag can't race it. */
	.vrp-list.reordering { pointer-events: none; }

</style>
