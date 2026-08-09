import { onDestroy, untrack } from 'svelte';
import { page } from '$app/state';
import { goto } from '$app/navigation';
import { auth } from '$lib/stores/auth.svelte.js';
import { groupsService } from '$lib/api/groupsService.js';
import { groupsStore } from '$lib/stores/groups.svelte.js';
import { ws, type WsEvent } from '$lib/stores/ws.svelte.js';
import { gotoKeepSearch } from '$lib/utils.js';
import { routes } from '$lib/routes.js';
import { lookupMember } from '$lib/utils/members.js';
import {
	groupHeaderCaches,
	MAX_CACHED_GROUPS,
} from '$lib/hooks/chat/useGroupChatCache.svelte.js';
import type { Group, GroupMember } from '$lib/api/groups.js';
import type { ChatPanelEvent } from '$lib/chat/types.js';

/**
 * A group's chat screen. `ChatPanel` owns the message stream, its cache and its
 * scroll; this owns the header around it — which group, who is in it — and the
 * two socket events that mean this page should no longer be on screen.
 *
 * Route-bound, so it reads `page` itself.
 */
export function useGroupChatPage() {
	const groupId = $derived(page.params.id!);

	let group = $state<Group | null>(null);
	let members = $state<GroupMember[]>([]);

	// Which group the current `group`/`members` belong to. Navigation swaps them
	// before the effect that would tell us, so the id is tracked alongside.
	let loadedId: string | undefined;

	// ─── Warm header cache ────────────────────────────────────
	// Re-entering a group you were just in should paint immediately rather than
	// blanking the header for a round-trip. Re-inserting on read makes the Map
	// insertion order an LRU, so the eviction below drops the least recent.
	function stash() {
		if (!loadedId || !group) return;
		groupHeaderCaches.delete(loadedId);
		groupHeaderCaches.set(loadedId, { group, members });
		if (groupHeaderCaches.size > MAX_CACHED_GROUPS) {
			const oldest = groupHeaderCaches.keys().next().value!;
			groupHeaderCaches.delete(oldest);
		}
	}

	/**
	 * Paints from the cache when there is one, and refreshes either way.
	 *
	 * The cache only ever buys the first frame. `group_updated` keeps it honest
	 * while this page is mounted, but anything changed from *another* screen —
	 * the settings page renaming the group or setting its picture — happens with
	 * this page unmounted, so the event is never seen and the cached copy comes
	 * back stale. Re-entering the group would show the old header until a reload.
	 */
	async function load(id: string) {
		const cached = groupHeaderCaches.get(id);
		if (cached) {
			groupHeaderCaches.delete(id);
			group = cached.group;
			members = cached.members;
		}
		groupsStore.clearUnread(id);

		try {
			const info = await groupsService.get(id);
			// A response for a group we've since navigated away from is stale.
			if (id !== groupId) return;
			group = info.group;
			members = info.members;
			groupsStore.upsert(info.group);
		} catch (err) {
			// A cache hit already put something on screen; a failed refresh leaves
			// it there rather than blanking the header.
			console.error('[useGroupChatPage] load failed', err);
		}
	}

	$effect(() => {
		const id = groupId;
		if (!id) return;
		untrack(() => {
			stash();
			loadedId = id;
			group = null;
			members = [];
			void load(id);
		});
	});

	onDestroy(stash);

	// ─── Live updates ─────────────────────────────────────────
	// Only the events `ChatPanel` doesn't already handle: the roster, the group's
	// own details, and the two ways this page stops being valid.
	$effect(() => {
		const id = groupId;
		return ws.on((e) => {
			switch (e.type) {
				case 'group_member_joined':
					if (e.groupId !== id) return;
					if (members.some((m) => m.userId === e.member.userId)) return;
					members = [
						...members,
						{
							userId: e.member.userId,
							role: e.member.role,
							nickname: e.member.nickname,
							joinedAt: e.member.joinedAt,
							username: e.member.user.username,
							displayName: e.member.user.displayName,
							avatarUrl: e.member.user.avatarUrl,
						},
					];
					return;
				case 'group_member_left':
					if (e.groupId !== id) return;
					members = members.filter((m) => m.userId !== e.userId);
					// Being the one who left means this page is no longer ours to see.
					if (e.userId === auth.user?.id) goto(routes.chats.root);
					return;
				case 'group_member_role':
					if (e.groupId !== id) return;
					members = members.map((m) => (m.userId === e.userId ? { ...m, role: e.role } : m));
					if (e.userId === auth.user?.id && group) group = { ...group, role: e.role };
					return;
				case 'group_updated':
					if (e.groupId !== id || !group) return;
					group = { ...group, ...e.patch };
					return;
				case 'group_deleted':
					if (e.groupId !== id) return;
					goto(routes.chats.root);
					return;
			}
		});
	});

	/** Maps the group message events onto the shape `ChatPanel` consumes. */
	function matchEvent(e: WsEvent): ChatPanelEvent | null {
		switch (e.type) {
			case 'group_message':
				if (e.groupId !== groupId) return null;
				return { kind: 'message', message: e.message };
			case 'group_message_edited':
				if (e.groupId !== groupId) return null;
				return {
					kind: 'edited',
					messageId: e.messageId,
					content: e.content,
					attachments: e.attachments,
					updatedAt: e.updatedAt,
				};
			case 'group_message_deleted':
				if (e.groupId !== groupId) return null;
				return { kind: 'deleted', messageId: e.messageId };
			case 'group_message_pinned':
				if (e.groupId !== groupId) return null;
				return {
					kind: 'pinned',
					messageId: e.messageId,
					pinnedAt: e.pinnedAt,
					pinnedBy: e.pinnedBy,
				};
			case 'group_message_unpinned':
				if (e.groupId !== groupId) return null;
				return { kind: 'unpinned', messageId: e.messageId };
			case 'group_message_reaction':
				if (e.groupId !== groupId) return null;
				return { kind: 'reaction', messageId: e.messageId, reactions: e.reactions };
			default:
				return null;
		}
	}

	return {
		get groupId() { return groupId; },
		get group() { return group; },
		get members() { return members; },
		matchEvent,
		reactorLookup(userId: string) {
			return lookupMember(members, userId, auth.user ?? null);
		},
		openInfo() { gotoKeepSearch(routes.chats.groupInfo(groupId)); },
		openSettings() { gotoKeepSearch(routes.chats.groupSettings(groupId)); },
	};
}
