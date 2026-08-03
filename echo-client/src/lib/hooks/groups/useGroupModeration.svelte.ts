import { auth } from '$lib/stores/auth.svelte.js';
import { groupsService } from '$lib/api/groupsService.js';
import { confirm } from '$lib/stores/confirm.svelte.js';
import { toasts } from '$lib/stores/toasts.svelte.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';
import type { GroupMember } from '$lib/api/groups.js';

/**
 * What staff can do to somebody else in the group: promote, demote, hand over
 * the group, throw them out — plus the row menu those all hang off, which is
 * why it lives here and not next to the roster's search box.
 *
 * The roster itself belongs to `useGroupSettings`; this reaches it through the
 * accessors it is handed.
 */
export function useGroupModeration(deps: {
	groupId: () => string;
	members: () => GroupMember[];
	setMembers: (next: GroupMember[]) => void;
	isOwner: () => boolean;
	canManage: () => boolean;
	/** The group is somebody else's now — the caller demotes itself to admin. */
	onOwnershipTransferred: () => void;
}) {
	const t = $derived(i18n.t);

	let menuFor = $state<string | null>(null);

	/**
	 * Who this person may be acted upon by. An admin can moderate members but
	 * not their peers, nobody can moderate the owner, and nobody moderates
	 * themselves — leaving is a different door.
	 */
	function canActOn(target: GroupMember): boolean {
		if (!deps.canManage()) return false;
		if (target.userId === auth.user?.id) return false;
		if (target.role === 'owner') return false;
		if (target.role === 'admin' && !deps.isOwner()) return false;
		return true;
	}

	async function changeRole(m: GroupMember, role: 'admin' | 'member') {
		menuFor = null;
		try {
			await groupsService.updateMember(deps.groupId(), m.userId, { role });
			deps.setMembers(deps.members().map((x) => (x.userId === m.userId ? { ...x, role } : x)));
		} catch (err) {
			console.error('[useGroupModeration] role change failed', err);
			toasts.error(t.groupSettings.roleChangeFailed);
		}
	}

	async function transferOwnership(m: GroupMember) {
		menuFor = null;
		const name = m.displayName ?? m.username;
		const ok = await confirm({
			title: t.groupSettings.transferOwnershipTitle,
			message: t.groupSettings.transferOwnershipBody(name),
			tone: 'danger',
			confirmLabel: t.groupSettings.transferOwnership,
		});
		if (!ok) return;
		try {
			await groupsService.transfer(deps.groupId(), m.userId);
			deps.setMembers(
				deps.members().map((x) => {
					if (x.userId === m.userId) return { ...x, role: 'owner' };
					if (x.userId === auth.user?.id) return { ...x, role: 'admin' };
					return x;
				}),
			);
			deps.onOwnershipTransferred();
		} catch (err) {
			console.error('[useGroupModeration] transfer failed', err);
			toasts.error(t.groupSettings.transferFailed);
		}
	}

	async function removeMember(m: GroupMember) {
		menuFor = null;
		const name = m.displayName ?? m.username;
		const ok = await confirm({
			title: t.groupSettings.removeMemberTitle,
			message: t.groupSettings.removeMemberBody(name),
			tone: 'danger',
			confirmLabel: t.groupSettings.remove,
		});
		if (!ok) return;
		try {
			await groupsService.removeMember(deps.groupId(), m.userId);
			deps.setMembers(deps.members().filter((x) => x.userId !== m.userId));
		} catch (err) {
			console.error('[useGroupModeration] remove failed', err);
			toasts.error(t.groupSettings.removeFailed);
		}
	}

	return {
		isMenuOpen(userId: string) { return menuFor === userId; },
		toggleMenu(userId: string) { menuFor = menuFor === userId ? null : userId; },
		closeMenu() { menuFor = null; },
		canActOn,
		changeRole,
		transferOwnership,
		removeMember,
	};
}
