import { tick, untrack } from 'svelte';
import { page } from '$app/state';
import { replaceState } from '$app/navigation';
import { auth } from '$lib/stores/auth.svelte.js';
import { personalChatsStore } from '$lib/stores/personalChats.svelte.js';
import { usePersonalChats } from '$lib/hooks/chat/usePersonalChats.svelte.js';
import { useGroups } from '$lib/hooks/groups/useGroups.svelte.js';
import { useUserSearch } from '$lib/hooks/user/useUserSearch.svelte.js';
import type { ChatsFilter } from '$lib/routes.js';
import type { GroupListItem } from '$lib/stores/groups.svelte.js';

export type ChatsSidebarItem =
	| { kind: 'pc'; id: string; sortKey: number; chat: (typeof personalChatsStore.list)[number] }
	| { kind: 'gr'; id: string; sortKey: number; group: GroupListItem };

/**
 * The one chat list. Personal chats and groups are merged into a single
 * newest-first list; the rail's tabs narrow it through `?filter=` rather than
 * navigating to a list of their own, so the filter is read off the URL and the
 * page never changes.
 */
export function useChatsSidebar() {
	const chats = usePersonalChats();
	const groups = useGroups();
	const userSearch = useUserSearch();

	const filter = $derived((page.url.searchParams.get('filter') as ChatsFilter | null) ?? null);

	let searchQuery = $state(page.url.searchParams.get('q') ?? '');
	const isSearching = $derived(searchQuery.trim().length > 0);

	// The query lives in the URL so it survives opening a chat and coming back
	// (`gotoKeepSearch` carries the search string along).
	$effect(() => {
		const q = searchQuery;
		tick().then(() =>
			untrack(() => {
				const url = new URL(page.url);
				if (q.trim()) url.searchParams.set('q', q);
				else url.searchParams.delete('q');
				replaceState(url, {});
			}),
		);
	});

	const items = $derived.by<ChatsSidebarItem[]>(() => {
		const meId = auth.user?.id;
		const pcItems: ChatsSidebarItem[] =
			filter === 'groups'
				? []
				: personalChatsStore.list
						.filter((c) => !meId || c.user.id !== meId)
						.map((chat) => {
							const ts = chat.lastMessage?.createdAt ?? chat.createdAt;
							return {
								kind: 'pc' as const,
								id: `pc-${chat.id}`,
								sortKey: ts ? Date.parse(ts) : 0,
								chat,
							};
						});
		const grItems: ChatsSidebarItem[] =
			filter === 'personal'
				? []
				: groups.list.map((group) => {
						const ts = group.lastMessage?.createdAt ?? group.createdAt;
						return {
							kind: 'gr' as const,
							id: `gr-${group.id}`,
							sortKey: ts ? Date.parse(ts) : 0,
							group,
						};
					});
		return [...pcItems, ...grItems].sort((a, b) => b.sortKey - a.sortKey);
	});

	const filtered = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return items;
		return items.filter((it) =>
			it.kind === 'pc'
				? (it.chat.user.displayName ?? it.chat.user.username).toLowerCase().includes(q)
				: it.group.name.toLowerCase().includes(q),
		);
	});

	// Searching a name nobody in the list matches falls through to a global user
	// search, so a first conversation can start from the same box. Pointless
	// while the list is narrowed to groups.
	$effect(() => {
		if (filter !== 'groups' && isSearching && filtered.length === 0) {
			userSearch.query = searchQuery;
			userSearch.handleInput();
		} else {
			userSearch.query = '';
		}
	});

	function onScroll(e: Event) {
		const el = e.target as HTMLDivElement;
		if (el.scrollHeight - el.scrollTop - el.clientHeight < 100 && chats.hasMore && !chats.loadingMore) {
			chats.loadMore();
		}
	}

	return {
		get filter() {
			return filter;
		},
		get items() {
			return filtered;
		},
		get searchQuery() {
			return searchQuery;
		},
		set searchQuery(v: string) {
			searchQuery = v;
		},
		get isSearching() {
			return isSearching;
		},
		get tempChat() {
			return filter === 'groups' ? null : personalChatsStore.tempChat;
		},
		get invites() {
			return groups.invites;
		},
		get loadingMore() {
			return chats.loadingMore;
		},
		userSearch,
		markRead: chats.markRead,
		onScroll,
	};
}
