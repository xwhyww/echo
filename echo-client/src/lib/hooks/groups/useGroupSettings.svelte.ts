import { auth } from '$lib/stores/auth.svelte.js';
import { groupsService } from '$lib/api/groupsService.js';
import { groupsStore } from '$lib/stores/groups.svelte.js';
import { toasts } from '$lib/stores/toasts.svelte.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';
import { useGroupDeparture } from '$lib/hooks/groups/useGroupDeparture.svelte.js';
import { useGroupModeration } from '$lib/hooks/groups/useGroupModeration.svelte.js';
import type { PolicyField } from '$lib/utils/groupPolicies.js';
import type { Group, GroupMember } from '$lib/api/groups.js';

/**
 * The group settings screen: the group and its roster, who is allowed to do
 * what, and the invite link. Acting on another member is `useGroupModeration`;
 * leaving or deleting the group is `useGroupDeparture`.
 */
export function useGroupSettings(groupId: () => string) {
	const t = $derived(i18n.t);
	const id = $derived(groupId());

	let group = $state<Group | null>(null);
	let members = $state<GroupMember[]>([]);
	let loading = $state(true);

	let nameDraft = $state('');
	let descDraft = $state('');
	let saving = $state(false);
	let savingPolicy = $state(false);

	let memberQuery = $state('');

	let copied = $state(false);
	let regenerating = $state(false);

	// ─── Who am I here ────────────────────────────────────────
	const myRole = $derived(group?.role ?? 'member');
	const isOwner = $derived(myRole === 'owner');
	const canManage = $derived(myRole === 'owner' || myRole === 'admin');

	const canInvitePeople = $derived.by(() => {
		const policy = group?.invitePolicy ?? 'admins';
		if (policy === 'owner') return isOwner;
		if (policy === 'admins') return canManage;
		return true;
	});

	const canEditInfo = $derived.by(() => {
		const policy = group?.editInfoPolicy ?? 'admins';
		if (policy === 'owner') return isOwner;
		return canManage;
	});

	const dirty = $derived(
		!!group
		&& (nameDraft.trim() !== group.name || (descDraft || '') !== (group.description || '')),
	);

	const inviteLink = $derived(
		group?.inviteCode ? `${window.location.origin}/invite/${group.inviteCode}` : '',
	);

	const filteredMembers = $derived.by(() => {
		const q = memberQuery.trim().toLowerCase();
		if (!q) return members;
		return members.filter(
			(m) =>
				m.username.toLowerCase().includes(q)
				|| (m.displayName ?? '').toLowerCase().includes(q),
		);
	});

	// ─── The two hooks that act on people ─────────────────────
	const moderation = useGroupModeration({
		groupId: () => id,
		members: () => members,
		setMembers: (next) => (members = next),
		isOwner: () => isOwner,
		canManage: () => canManage,
		onOwnershipTransferred: () => {
			if (group) group = { ...group, role: 'admin' };
		},
	});

	const departure = useGroupDeparture({
		groupId: () => id,
		isOwner: () => isOwner,
		groupName: () => group?.name ?? null,
	});

	// ─── Load ─────────────────────────────────────────────────
	$effect(() => {
		if (id) void load();
	});

	async function load() {
		loading = true;
		try {
			const info = await groupsService.get(id);
			group = info.group;
			members = info.members;
			nameDraft = info.group.name;
			descDraft = info.group.description ?? '';
		} catch (err) {
			console.error('[useGroupSettings] load failed', err);
			toasts.error(t.groupInfo.loadFailed);
		} finally {
			loading = false;
		}
	}

	// ─── Details + policies ───────────────────────────────────
	async function save() {
		if (!group || !canEditInfo || !dirty) return;
		const patch: Record<string, string | null> = {};
		if (nameDraft.trim() !== group.name) patch.name = nameDraft.trim();
		if ((descDraft || '') !== (group.description || '')) {
			patch.description = descDraft.trim() || null;
		}
		saving = true;
		try {
			const res = await groupsService.update(id, patch as never);
			group = { ...group, ...res.group };
			groupsStore.patch(id, res.group);
		} catch (err) {
			console.error('[useGroupSettings] save failed', err);
			toasts.error(t.groupSettings.saveFailed);
		} finally {
			saving = false;
		}
	}

	// Applied optimistically: a policy switch should feel instant, and the
	// previous value goes back if the server disagrees.
	async function setPolicy(field: PolicyField, value: string | boolean) {
		if (!group || !isOwner || savingPolicy) return;
		const current = group as unknown as Record<string, unknown>;
		if (current[field] === value) return;
		const previous = current[field];
		group = { ...group, [field]: value } as Group;
		savingPolicy = true;
		try {
			const res = await groupsService.update(id, { [field]: value } as never);
			group = { ...group, ...res.group };
			groupsStore.patch(id, res.group);
		} catch (err) {
			console.error('[useGroupSettings] policy update failed', err);
			toasts.error(t.groupSettings.updateSettingFailed);
			if (group) group = { ...group, [field]: previous } as Group;
		} finally {
			savingPolicy = false;
		}
	}

	// ─── Invite link ──────────────────────────────────────────
	async function regenerate() {
		if (!canManage) return;
		regenerating = true;
		try {
			const res = await groupsService.regenerateInviteLink(id);
			if (group) group = { ...group, inviteCode: res.inviteCode };
		} catch (err) {
			console.error('[useGroupSettings] regenerate failed', err);
			toasts.error(t.groupSettings.regenerateFailed);
		} finally {
			regenerating = false;
		}
	}

	async function copyLink() {
		if (!inviteLink) return;
		try {
			await navigator.clipboard.writeText(inviteLink);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			toasts.error(t.errors.copyFailed);
		}
	}

	return {
		get group() { return group; },
		get members() { return members; },
		get filteredMembers() { return filteredMembers; },
		get loading() { return loading || !group; },
		get myRole() { return myRole; },
		get isOwner() { return isOwner; },
		get canManage() { return canManage; },
		get canInvitePeople() { return canInvitePeople; },
		get canEditInfo() { return canEditInfo; },

		get nameDraft() { return nameDraft; },
		set nameDraft(v: string) { nameDraft = v; },
		get descDraft() { return descDraft; },
		set descDraft(v: string) { descDraft = v; },
		get dirty() { return dirty; },
		get saving() { return saving; },
		get savingPolicy() { return savingPolicy; },
		save,
		setPolicy,

		get memberQuery() { return memberQuery; },
		set memberQuery(v: string) { memberQuery = v; },
		isSelf(userId: string) { return userId === auth.user?.id; },
		isMenuOpen: moderation.isMenuOpen,
		toggleMenu: moderation.toggleMenu,
		closeMenu: moderation.closeMenu,
		canActOn: moderation.canActOn,
		changeRole: moderation.changeRole,
		transferOwnership: moderation.transferOwnership,
		removeMember: moderation.removeMember,
		/** Pulls the roster back in after the invite modal has added people. */
		reload: load,
		/**
		 * Merges a group the server has just returned — the avatar editor's, so
		 * far — without a round trip back through `load`. Local state only; the
		 * caller that made the change owns telling the store about it.
		 */
		applyGroup(next: Group) {
			group = group ? { ...group, ...next } : next;
		},

		get inviteLink() { return inviteLink; },
		get copied() { return copied; },
		get regenerating() { return regenerating; },
		copyLink,
		regenerate,

		get leaving() { return departure.leaving; },
		get deleting() { return departure.deleting; },
		get pendingLeave() { return departure.pendingLeave; },
		get pendingDelete() { return departure.pendingDelete; },
		startLeave: departure.startLeave,
		cancelLeave: departure.cancelLeave,
		commitLeave: departure.commitLeave,
		startDelete: departure.startDelete,
		cancelDelete: departure.cancelDelete,
		commitDelete: departure.commitDelete,
	};
}
