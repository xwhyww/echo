import { getFriendsContext, type FriendRequest } from '$lib/hooks/friends/useFriends.svelte.js';

export type RequestDirection = 'incoming' | 'outgoing';

/**
 * One side of the friend-request inbox. Incoming and outgoing differ only in
 * which slice of the shared friends context they read and what you can do with
 * a row, so both pages run on this.
 */
export function useFriendRequests(direction: RequestDirection) {
	const friends = getFriendsContext();
	const incoming = $derived(direction === 'incoming');

	const items = $derived<FriendRequest[]>(incoming ? friends.incoming : friends.outgoing);
	const loading = $derived(incoming ? friends.loadingIncoming : friends.loadingOutgoing);
	const loaded = $derived(incoming ? friends.incomingLoaded : friends.outgoingLoaded);
	const hasMore = $derived(incoming ? friends.incomingHasMore : friends.outgoingHasMore);

	function load(opts: { reset?: boolean } = {}) {
		if (incoming) void friends.loadIncoming(opts);
		else void friends.loadOutgoing(opts);
	}

	// First page on arrival, and again whenever a mutation event resets the
	// list's `loaded` flag from under us.
	$effect(() => {
		if (!loaded && !loading) load({ reset: true });
	});

	return {
		get items() { return items; },
		// Only the first page blanks the screen; later pages have rows to sit under.
		get loading() { return loading && items.length === 0; },
		get loadingMore() { return loading; },
		get hasMore() { return hasMore; },
		get acting() { return friends.acting; },
		loadMore() { load(); },
		accept(userId: string) { void friends.acceptRequest(userId); },
		decline(userId: string) { void friends.declineRequest(userId); },
		cancel(userId: string) { void friends.cancelRequest(userId); },
	};
}
