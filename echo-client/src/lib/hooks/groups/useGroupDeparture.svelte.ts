import { goto } from '$app/navigation';
import { auth } from '$lib/stores/auth.svelte.js';
import { groupsService } from '$lib/api/groupsService.js';
import { groupsStore } from '$lib/stores/groups.svelte.js';
import { confirm } from '$lib/stores/confirm.svelte.js';
import { toasts } from '$lib/stores/toasts.svelte.js';
import { routes } from '$lib/routes.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';

/**
 * The two ways to walk away from a group: leaving it, and deleting it.
 *
 * Both are two-step. Nothing reaches the server while `pending` is true — that
 * is the undo bar's window, and the commit only runs when it times out. So the
 * `pending` flags are what the bar is bound to, and `leaving` / `deleting` are
 * the request that follows it.
 */
export function useGroupDeparture(deps: {
	groupId: () => string;
	isOwner: () => boolean;
	groupName: () => string | null;
}) {
	const t = $derived(i18n.t);

	let leaving = $state(false);
	let deleting = $state(false);
	let pendingLeave = $state(false);
	let pendingDelete = $state(false);

	async function commitLeave() {
		if (!auth.user) return;
		pendingLeave = false;
		leaving = true;
		try {
			await groupsService.leave(deps.groupId(), auth.user.id);
			groupsStore.remove(deps.groupId());
			goto(routes.chats.root);
		} catch (err) {
			console.error('[useGroupDeparture] leave failed', err);
			toasts.error(t.groupSettings.leaveFailed);
			leaving = false;
		}
	}

	async function commitDelete() {
		if (!deps.isOwner()) return;
		pendingDelete = false;
		deleting = true;
		try {
			await groupsService.remove(deps.groupId());
			groupsStore.remove(deps.groupId());
			goto(routes.chats.root);
		} catch (err) {
			console.error('[useGroupDeparture] delete failed', err);
			toasts.error(t.groupSettings.deleteFailed);
			deleting = false;
		}
	}

	return {
		get leaving() { return leaving; },
		get deleting() { return deleting; },
		get pendingLeave() { return pendingLeave; },
		get pendingDelete() { return pendingDelete; },
		startLeave() { if (auth.user) pendingLeave = true; },
		cancelLeave() { pendingLeave = false; },
		commitLeave,
		// Deleting asks first — typing the group's name — and only then opens the
		// undo window. Leaving is recoverable by rejoining; this isn't.
		async startDelete() {
			const name = deps.groupName();
			if (!deps.isOwner() || !name) return;
			const ok = await confirm({
				title: t.groupSettings.deleteGroupTitle,
				message: t.groupSettings.deleteGroupBody(name),
				tone: 'danger',
				confirmLabel: t.groupSettings.deleteGroup,
				requireText: name,
			});
			if (ok) pendingDelete = true;
		},
		cancelDelete() { pendingDelete = false; },
		commitDelete,
	};
}
