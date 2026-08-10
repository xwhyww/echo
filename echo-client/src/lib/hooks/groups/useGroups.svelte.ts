import { onMount } from 'svelte';
import { groupsService } from '$lib/api/groupsService.js';
import { groupsStore } from '$lib/stores/groups.svelte.js';
import { ws, type WsEvent } from '$lib/stores/ws.svelte.js';
import { auth } from '$lib/stores/auth.svelte.js';
import { noteGroupMessageWhileAway } from '$lib/hooks/chat/useGroupChatCache.svelte.js';

let bootstrapped = false;

async function loadAll() {
	try {
		const [list, inv] = await Promise.all([
			groupsService.list(),
			groupsService.incomingInvites(),
		]);
		groupsStore.setList(list.groups);
		groupsStore.setInvites(inv.invites);
	} catch (err) {
		console.error('[useGroups] load failed', err);
	}
}

function handleWs(event: WsEvent) {
	const meId = auth.user?.id;
	switch (event.type) {
		case 'group_created':
			groupsStore.upsert({ ...event.group, role: event.group.ownerId === meId ? 'owner' : 'member' } as any);
			break;
		case 'group_updated':
			groupsStore.patch(event.groupId, event.patch);
			break;
		case 'group_deleted':
			groupsStore.remove(event.groupId);
			break;
		case 'group_member_joined':
			// If *I* joined a new group, refresh the list to pick up role + details.
			if (event.member.userId === meId) loadAll();
			break;
		case 'group_member_left':
			if (event.userId === meId) groupsStore.remove(event.groupId);
			break;
		case 'group_member_role':
			if (event.userId === meId) groupsStore.patch(event.groupId, { role: event.role });
			break;
		case 'group_invite_created':
			groupsStore.addInvite(event.invite);
			break;
		case 'group_invite_responded':
			if (event.inviteeId === meId) groupsStore.removeInvite(event.inviteId);
			break;
		case 'group_message': {
			const isMine = event.message.authorId === meId;
			groupsStore.updateLastMessage(event.groupId, event.message, !isMine);
			// Keeps the warm window of a chat nobody has open from going stale;
			// a no-op for the one that is (it holds no cache entry while mounted).
			noteGroupMessageWhileAway(event.groupId, event.message);
			break;
		}
		case 'group_read':
			if (event.userId === meId) groupsStore.clearUnread(event.groupId);
			break;
		case 'reconnected':
			loadAll();
			break;
	}
}

export function useGroups() {
	onMount(() => {
		if (!bootstrapped) {
			bootstrapped = true;
			loadAll();
		}
		// Wrapped rather than passed straight in: `handleWs` is one shared
		// module-level function, and the store keeps listeners in a Set. Every
		// caller registering the same reference means one entry between them —
		// so the first component to unmount used to delete the listener out from
		// under all the others, and group events silently stopped arriving until
		// a reload. A fresh closure per caller gives each its own entry.
		const off = ws.on((event) => handleWs(event));
		return () => off();
	});

	return {
		get list() { return groupsStore.list; },
		get loaded() { return groupsStore.loaded; },
		get invites() { return groupsStore.invites; },
		refresh: loadAll,
	};
}
