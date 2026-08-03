import { groupsService } from '$lib/api/groupsService.js';
import { groupsStore } from '$lib/stores/groups.svelte.js';
import { toasts } from '$lib/stores/toasts.svelte.js';
import { gotoKeepSearch } from '$lib/utils.js';
import { useGroups } from '$lib/hooks/groups/useGroups.svelte.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';

/**
 * Pending group invitations and the two things you can do with one. Accepting
 * takes you straight into the group; declining just drops the row.
 */
export function useGroupInvites() {
	const t = $derived(i18n.t);
	const groups = useGroups();

	// Per-invite rather than a single flag, so one slow request doesn't freeze
	// the buttons on every other row.
	let busy = $state<Record<string, boolean>>({});

	async function act(id: string, run: () => Promise<void>, failure: string) {
		if (busy[id]) return;
		busy = { ...busy, [id]: true };
		try {
			await run();
		} catch (err) {
			console.error('[useGroupInvites] failed', err);
			toasts.error(failure);
		} finally {
			busy = { ...busy, [id]: false };
		}
	}

	return {
		get invites() { return groups.invites; },
		isBusy(id: string) { return !!busy[id]; },

		accept(id: string) {
			return act(id, async () => {
				const r = await groupsService.acceptInvite(id);
				groupsStore.removeInvite(id);
				await groups.refresh();
				gotoKeepSearch(`/chats/groups/${r.groupId}`);
			}, t.invites.acceptFailed);
		},

		decline(id: string) {
			return act(id, async () => {
				await groupsService.declineInvite(id);
				groupsStore.removeInvite(id);
			}, t.invites.declineFailed);
		},
	};
}
