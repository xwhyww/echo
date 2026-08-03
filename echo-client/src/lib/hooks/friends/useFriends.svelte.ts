import { ws } from '$lib/stores/ws.svelte.js';
import { friendsStore } from '$lib/stores/friends.svelte.js';
import { getContext, onDestroy } from 'svelte';
import { friendsService } from '$lib/api/friendsService.js';
import { userService } from '$lib/api/userService.js';
import type { User } from '$lib/api/auth.js';

export const FRIENDS_KEY = Symbol('friends');

export type FriendsContext = ReturnType<typeof useFriends>;

export function getFriendsContext(): FriendsContext {
	return getContext<FriendsContext>(FRIENDS_KEY);
}

export interface FriendRequest {
	id: string;
	requesterId: string;
	addresseeId: string;
	status: string;
	createdAt: string;
	user?: User;
}

const PAGE_SIZE = 30;

export function useFriends() {
	let friends = $state<User[]>([]);
	let incoming = $state<FriendRequest[]>([]);
	let outgoing = $state<FriendRequest[]>([]);
	let loadingFriends = $state(false);
	let loadingIncoming = $state(false);
	let loadingOutgoing = $state(false);
	let friendsCursor = $state<string | null>(null);
	let incomingCursor = $state<string | null>(null);
	let outgoingCursor = $state<string | null>(null);
	let friendsHasMore = $state(true);
	let incomingHasMore = $state(true);
	let outgoingHasMore = $state(true);
	let friendsLoaded = $state(false);
	let incomingLoaded = $state(false);
	let outgoingLoaded = $state(false);
	let acting = $state(false);

	async function hydrateUsers(userIds: string[]): Promise<User[]> {
		if (userIds.length === 0) return [];
		try {
			const { users } = await userService.getBulk(userIds);
			const byId = new Map(users.map((u) => [u.id, u]));
			return userIds.map((id) => byId.get(id)).filter((u): u is User => !!u);
		} catch {
			return [];
		}
	}

	async function loadFriends({ reset = false }: { reset?: boolean } = {}) {
		if (loadingFriends) return;
		if (!reset && !friendsHasMore) return;
		loadingFriends = true;
		try {
			const cursor = reset ? null : friendsCursor;
			const { items, nextCursor } = await friendsService.listFriends({ cursor, limit: PAGE_SIZE });
			const users = await hydrateUsers(items.map((i) => i.userId));
			for (const u of users) friendsStore.setStatus(u.id, { status: 'friends' });
			friends = reset ? users : [...friends, ...users];
			friendsCursor = nextCursor;
			friendsHasMore = nextCursor !== null;
			friendsLoaded = true;
		} catch {
			if (reset) friends = [];
			friendsHasMore = false;
			friendsLoaded = true;
		}
		loadingFriends = false;
	}

	async function loadIncoming({ reset = false }: { reset?: boolean } = {}) {
		if (loadingIncoming) return;
		if (!reset && !incomingHasMore) return;
		loadingIncoming = true;
		try {
			const cursor = reset ? null : incomingCursor;
			const { items, nextCursor } = await friendsService.listIncoming({ cursor, limit: PAGE_SIZE });
			const users = await hydrateUsers(items.map((i) => i.userId));
			for (const u of users) friendsStore.setStatus(u.id, { status: 'pending', direction: 'incoming' });
			const reqs: FriendRequest[] = users.map((user, idx) => ({
				id: user.id,
				requesterId: user.id,
				addresseeId: '',
				status: 'pending',
				createdAt: items[idx]?.since ?? '',
				user,
			}));
			incoming = reset ? reqs : [...incoming, ...reqs];
			incomingCursor = nextCursor;
			incomingHasMore = nextCursor !== null;
			incomingLoaded = true;
		} catch {
			if (reset) incoming = [];
			incomingHasMore = false;
			incomingLoaded = true;
		}
		loadingIncoming = false;
	}

	async function loadOutgoing({ reset = false }: { reset?: boolean } = {}) {
		if (loadingOutgoing) return;
		if (!reset && !outgoingHasMore) return;
		loadingOutgoing = true;
		try {
			const cursor = reset ? null : outgoingCursor;
			const { items, nextCursor } = await friendsService.listOutgoing({ cursor, limit: PAGE_SIZE });
			const users = await hydrateUsers(items.map((i) => i.userId));
			for (const u of users) friendsStore.setStatus(u.id, { status: 'pending', direction: 'outgoing' });
			const reqs: FriendRequest[] = users.map((user, idx) => ({
				id: user.id,
				requesterId: '',
				addresseeId: user.id,
				status: 'pending',
				createdAt: items[idx]?.since ?? '',
				user,
			}));
			outgoing = reset ? reqs : [...outgoing, ...reqs];
			outgoingCursor = nextCursor;
			outgoingHasMore = nextCursor !== null;
			outgoingLoaded = true;
		} catch {
			if (reset) outgoing = [];
			outgoingHasMore = false;
			outgoingLoaded = true;
		}
		loadingOutgoing = false;
	}

	const unsubscribe = ws.on((event) => {
		if (event.type === 'friend_request' || event.type === 'friend_accepted'
			|| event.type === 'friend_declined' || event.type === 'friend_cancelled'
			|| event.type === 'friend_removed') {
			// Reset paginated lists — simplest correct strategy on mutation events.
			friendsCursor = null; friendsHasMore = true; friendsLoaded = false;
			incomingCursor = null; incomingHasMore = true; incomingLoaded = false;
			outgoingCursor = null; outgoingHasMore = true; outgoingLoaded = false;
		} else if (event.type === 'presence') {
			const { userId, online } = event as { userId: string; online: boolean; type: string };
			friends = friends.map((f) =>
				f.id === userId ? { ...f, isOnline: online } : f
			);
		}
	});
	onDestroy(unsubscribe);

	async function acceptRequest(userId: string) {
		if (acting) return;
		acting = true;
		try {
			await friendsService.acceptRequest(userId);
			incoming = incoming.filter((r) => r.requesterId !== userId);
			friendsStore.setStatus(userId, { status: 'friends' });
			friendsLoaded = false;
			friendsCursor = null;
			friendsHasMore = true;
			loadFriends({ reset: true });
		} catch { /* ignore */ }
		acting = false;
	}

	async function declineRequest(userId: string) {
		if (acting) return;
		acting = true;
		try {
			await friendsService.declineRequest(userId);
			incoming = incoming.filter((r) => r.requesterId !== userId);
			friendsStore.removeStatus(userId);
		} catch { /* ignore */ }
		acting = false;
	}

	async function cancelRequest(userId: string) {
		if (acting) return;
		acting = true;
		try {
			await friendsService.cancelRequest(userId);
			outgoing = outgoing.filter((r) => r.addresseeId !== userId);
			friendsStore.removeStatus(userId);
		} catch { /* ignore */ }
		acting = false;
	}

	async function removeFriend(userId: string) {
		if (acting) return;
		acting = true;
		try {
			await friendsService.removeFriend(userId);
			friends = friends.filter((f) => f.id !== userId);
			friendsStore.removeStatus(userId);
		} catch { /* ignore */ }
		acting = false;
	}

	return {
		get friends() { return friends; },
		get incoming() { return incoming; },
		get outgoing() { return outgoing; },
		get loadingFriends() { return loadingFriends; },
		get loadingIncoming() { return loadingIncoming; },
		get loadingOutgoing() { return loadingOutgoing; },
		get friendsHasMore() { return friendsHasMore; },
		get incomingHasMore() { return incomingHasMore; },
		get outgoingHasMore() { return outgoingHasMore; },
		get friendsLoaded() { return friendsLoaded; },
		get incomingLoaded() { return incomingLoaded; },
		get outgoingLoaded() { return outgoingLoaded; },
		get acting() { return acting; },
		loadFriends,
		loadIncoming,
		loadOutgoing,
		acceptRequest,
		declineRequest,
		cancelRequest,
		removeFriend,
	};
}
