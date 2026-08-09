<script lang="ts">
	import { page } from '$app/state';
	import { LogOut, Trash2, Lock, Search, UserPlus } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import GroupAvatarEditor from '$lib/components/groups/GroupAvatarEditor.svelte';
	import GroupInviteModal from '$lib/components/groups/GroupInviteModal.svelte';
	import GroupMemberRow from '$lib/components/groups/GroupMemberRow.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import InviteLinkRow from '$lib/components/groups/InviteLinkRow.svelte';
	import LoadState from '$lib/components/ui/LoadState.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import SettingRow from '$lib/components/settings/SettingRow.svelte';
	import UndoBar from '$lib/components/ui/UndoBar.svelte';
	import PageColumn from '$lib/components/layouts/PageColumn.svelte';
	import { useGroupSettings } from '$lib/hooks/groups/useGroupSettings.svelte.js';
	import { groupPolicyFields } from '$lib/utils/groupPolicies.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	const groupId = $derived(page.params.id!);
	const settings = useGroupSettings(() => groupId);

	const memberIds = $derived(new Set(settings.members.map((m) => m.userId)));
	const policies = $derived(groupPolicyFields(t));

	let showInvite = $state(false);

	function closeInvite() {
		showInvite = false;
		// People may have accepted nothing yet, but the roster is the source of
		// truth for who can still be invited next time.
		void settings.reload();
	}
</script>

<PageColumn gap="var(--sp-6)">
	<LoadState loading={settings.loading}>
		{#if settings.group}
			{@const group = settings.group}
			<header class="hdr">
				<GroupAvatarEditor
					{group}
					canEdit={settings.canEditInfo}
					size={72}
					onchange={settings.applyGroup}
				/>
				<div>
					<h1 class="heading-lg">{group.name}</h1>
					<p class="body-sm text-faint">
						{t.groupInfo.memberCount(settings.members.length)} ·
						{t.groupSettings.youAre(t.groupsPage.roles[settings.myRole])}
					</p>
				</div>
			</header>

			<Card title={t.groupSettings.details}>
				<Field label={t.common.name}>
					<Input
						bind:value={settings.nameDraft}
						placeholder={t.groupSettings.namePlaceholder}
						disabled={!settings.canEditInfo}
					/>
				</Field>
				<Field label={t.common.description}>
					<Input
						bind:value={settings.descDraft}
						placeholder={t.groupSettings.descriptionPlaceholder}
						disabled={!settings.canEditInfo}
					/>
				</Field>
				{#if settings.canEditInfo && settings.dirty}
					<div class="row-end">
						<Button variant="primary" disabled={settings.saving} onclick={settings.save}>
							{settings.saving ? t.common.saving : t.common.save}
						</Button>
					</div>
				{/if}
			</Card>

			<Card title={t.groupInfo.memberCount(settings.members.length)}>
				{#snippet actions()}
					{#if settings.canInvitePeople}
						<Button variant="primary" onclick={() => (showInvite = true)}>
							<UserPlus size={16} /> {t.groupSettings.invite}
						</Button>
					{/if}
				{/snippet}

				<Input bind:value={settings.memberQuery} placeholder={t.groupSettings.searchMembers}>
					{#snippet icon()}<Search size={16} />{/snippet}
				</Input>

				{#if settings.filteredMembers.length === 0}
					<p class="body-sm text-faint">{t.groupSettings.noMembersMatch}</p>
				{:else}
					<ul class="member-list">
						{#each settings.filteredMembers as m (m.userId)}
							<GroupMemberRow
								member={m}
								isSelf={settings.isSelf(m.userId)}
								canAct={settings.canActOn(m)}
								isOwner={settings.isOwner}
								menuOpen={settings.isMenuOpen(m.userId)}
								onmenutoggle={() => settings.toggleMenu(m.userId)}
								onmenuclose={settings.closeMenu}
								onchangerole={(role) => settings.changeRole(m, role)}
								ontransfer={() => settings.transferOwnership(m)}
								onremove={() => settings.removeMember(m)}
							/>
						{/each}
					</ul>
				{/if}
			</Card>

			<Card title={t.groupSettings.inviteLink}>
				{#if settings.canInvitePeople}
					<InviteLinkRow
						link={settings.inviteLink}
						copied={settings.copied}
						canRegenerate={settings.canManage}
						regenerating={settings.regenerating}
						oncopy={settings.copyLink}
						onregenerate={settings.regenerate}
					/>
				{:else}
					<div class="locked text-faint">
						<Lock size={16} />
						<p class="body-sm">{t.groupSettings.inviteLocked((group.invitePolicy ?? 'admins') === 'owner')}</p>
					</div>
				{/if}
			</Card>

			{#if settings.isOwner}
				<Card title={t.groupSettings.management}>
					{#each policies as policy (policy.field)}
						<SettingRow label={policy.label} desc={policy.desc}>
							<SegmentedControl
								options={policy.options}
								value={String(policy.current(group))}
								onchange={(v) => settings.setPolicy(policy.field, policy.parse(v))}
								disabled={settings.savingPolicy}
								label={policy.label}
							/>
						</SettingRow>
					{/each}
				</Card>
			{/if}

			<Card title={t.groupSettings.dangerZone} tone="danger">
				{#if !settings.isOwner}
					<Button
						variant="ghost"
						disabled={settings.leaving || settings.pendingLeave}
						onclick={settings.startLeave}
					>
						<LogOut size={16} />
						{settings.leaving
							? t.groupSettings.leaving
							: settings.pendingLeave
								? t.groupSettings.undoToStay
								: t.groupSettings.leaveGroup}
					</Button>
				{:else}
					<Button
						variant="ghost"
						disabled={settings.deleting || settings.pendingDelete}
						onclick={settings.startDelete}
					>
						<Trash2 size={16} />
						{settings.deleting
							? t.groupSettings.deleting
							: settings.pendingDelete
								? t.groupSettings.undoToKeep
								: t.groupSettings.deleteGroup}
					</Button>
				{/if}
			</Card>
		{/if}
	</LoadState>
</PageColumn>

{#if showInvite}
	<GroupInviteModal {groupId} {memberIds} onclose={closeInvite} />
{/if}

{#if settings.pendingDelete && settings.group}
	<UndoBar
		message={t.groupSettings.deletingGroup(settings.group.name)}
		duration={5000}
		onconfirm={settings.commitDelete}
		oncancel={settings.cancelDelete}
	/>
{:else if settings.pendingLeave && settings.group}
	<UndoBar
		message={t.groupSettings.leavingGroup(settings.group.name)}
		duration={5000}
		onconfirm={settings.commitLeave}
		oncancel={settings.cancelLeave}
	/>
{/if}

<style>
	.hdr {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
	}

	.hdr h1,
	.hdr p {
		margin: 0;
	}

	.row-end {
		display: flex;
		justify-content: flex-end;
	}

	.member-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.locked {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.locked p {
		margin: 0;
	}
</style>
