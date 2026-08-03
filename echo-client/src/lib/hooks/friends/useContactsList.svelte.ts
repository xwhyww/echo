import { goto } from '$app/navigation';
import { routes } from '$lib/routes.js';
import { getFriendsContext } from '$lib/hooks/friends/useFriends.svelte.js';
import type { User } from '$lib/api/auth.js';

/**
 * The contacts list: the friends slice of the shared context, plus the
 * remove-with-undo flow the other people lists don't have.
 */
export function useContactsList() {
	const friends = getFriendsContext();

	// Set while the undo bar is counting down. The removal only reaches the
	// server if the bar times out un-cancelled.
	let pendingRemoveId = $state<string | null>(null);

	$effect(() => {
		if (!friends.friendsLoaded && !friends.loadingFriends) {
			void friends.loadFriends({ reset: true });
		}
	});

	return {
		get items(): User[] { return friends.friends; },
		// Only the first page blanks the screen; later pages have rows to sit under.
		get loading() { return friends.loadingFriends && friends.friends.length === 0; },
		get loadingMore() { return friends.loadingFriends; },
		get hasMore() { return friends.friendsHasMore; },
		get pendingRemoveId() { return pendingRemoveId; },
		loadMore() { void friends.loadFriends(); },
		open(userId: string) { goto(routes.user(userId)); },
		startRemove(userId: string) { pendingRemoveId = userId; },
		cancelRemove() { pendingRemoveId = null; },
		commitRemove() {
			const id = pendingRemoveId;
			pendingRemoveId = null;
			if (id) void friends.removeFriend(id);
		},
	};
}
