import { friendsService } from '$lib/api/friendsService.js';
import { userService } from '$lib/api/userService.js';
import { groupsService } from '$lib/api/groupsService.js';
import { toasts } from '$lib/stores/toasts.svelte.js';
import { useUserSearch } from '$lib/hooks/user/useUserSearch.svelte.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';
import type { PickableUser } from '$lib/hooks/groups/useCreateGroup.svelte.js';

function toPickable(u: {
	id: string;
	username: string;
	displayName?: string | null;
	avatarUrl?: string | null;
}): PickableUser {
	return {
		id: u.id,
		username: u.username,
		displayName: u.displayName ?? null,
		avatarUrl: u.avatarUrl ?? null,
	};
}

/**
 * Inviting people to an existing group. Candidates come from your friends
 * first, then from a search across everyone else; anyone already in the group
 * is filtered out of both.
 */
export function useGroupInvite(groupId: () => string, memberIds: () => Set<string>) {
	const t = $derived(i18n.t);
	const id = $derived(groupId());
	const already = $derived(memberIds());
	const search = useUserSearch();

	let friends = $state<PickableUser[]>([]);
	let friendsLoading = $state(true);
	// Per-user flags rather than one global one: several invites can be in
	// flight, and each row reports its own state.
	let inviting = $state<Set<string>>(new Set());
	let invited = $state<Set<string>>(new Set());

	$effect(() => {
		void loadFriends();
	});

	async function loadFriends() {
		friendsLoading = true;
		try {
			const { items } = await friendsService.listFriends({ limit: 100 });
			if (items.length === 0) {
				friends = [];
				return;
			}
			const { users } = await userService.getBulk(items.map((i) => i.userId));
			friends = users.map(toPickable);
		} catch (err) {
			console.error('[useGroupInvite] load friends failed', err);
			toasts.error(t.groupSettings.loadFriendsFailed);
		} finally {
			friendsLoading = false;
		}
	}

	const friendsAvailable = $derived(friends.filter((f) => !already.has(f.id)));
	const query = $derived(search.query.trim());
	const searchActive = $derived(query.length >= 2);

	const candidates = $derived.by(() => {
		if (!searchActive) return friendsAvailable;
		const q = query.toLowerCase();
		const matchingFriends = friendsAvailable.filter(
			(f) =>
				f.username.toLowerCase().includes(q)
				|| (f.displayName ?? '').toLowerCase().includes(q),
		);
		const seen = new Set(matchingFriends.map((f) => f.id));
		const others = search.results
			.map(toPickable)
			.filter((u) => !already.has(u.id) && !seen.has(u.id));
		return [...matchingFriends, ...others];
	});

	return {
		get query() { return search.query; },
		set query(v: string) { search.query = v; },
		onQueryInput: search.handleInput,
		get searchActive() { return searchActive; },
		get searching() { return search.searching; },
		get searched() { return search.searched; },

		get friendsLoading() { return friendsLoading; },
		get hasFriends() { return friends.length > 0; },
		get friendsAvailable() { return friendsAvailable; },
		get candidates() { return candidates; },
		isFriend(userId: string) { return friends.some((f) => f.id === userId); },
		isInviting(userId: string) { return inviting.has(userId); },
		isInvited(userId: string) { return invited.has(userId); },

		async invite(userId: string) {
			if (inviting.has(userId) || invited.has(userId)) return;
			inviting = new Set(inviting).add(userId);
			try {
				await groupsService.invite(id, userId);
				invited = new Set(invited).add(userId);
			} catch (err) {
				console.error('[useGroupInvite] invite failed', err);
				toasts.error(t.groupSettings.inviteFailed);
			} finally {
				const next = new Set(inviting);
				next.delete(userId);
				inviting = next;
			}
		},
	};
}
