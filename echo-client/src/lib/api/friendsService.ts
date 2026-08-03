import { api } from './client.js';

export type FriendshipStatus =
	| { status: 'none' }
	| { status: 'friends' }
	| { status: 'pending'; direction: 'incoming' | 'outgoing' }
	| { status: 'self' };

export interface FriendListItem {
	userId: string;
	since: string;
}

export interface PaginatedList {
	items: FriendListItem[];
	nextCursor: string | null;
}

class FriendsService {
	getStatus(userId: string) {
		return api<FriendshipStatus>(`/friends/status/${userId}`);
	}

	getIncomingCount() {
		return api<{ count: number }>('/friends/requests/incoming/count');
	}

	listFriends(opts: { cursor?: string | null; limit?: number } = {}) {
		const params = new URLSearchParams();
		if (opts.cursor) params.set('cursor', opts.cursor);
		if (opts.limit) params.set('limit', String(opts.limit));
		const qs = params.toString();
		return api<PaginatedList>(`/friends${qs ? `?${qs}` : ''}`);
	}

	listIncoming(opts: { cursor?: string | null; limit?: number } = {}) {
		const params = new URLSearchParams();
		if (opts.cursor) params.set('cursor', opts.cursor);
		if (opts.limit) params.set('limit', String(opts.limit));
		const qs = params.toString();
		return api<PaginatedList>(`/friends/requests/incoming${qs ? `?${qs}` : ''}`);
	}

	listOutgoing(opts: { cursor?: string | null; limit?: number } = {}) {
		const params = new URLSearchParams();
		if (opts.cursor) params.set('cursor', opts.cursor);
		if (opts.limit) params.set('limit', String(opts.limit));
		const qs = params.toString();
		return api<PaginatedList>(`/friends/requests/outgoing${qs ? `?${qs}` : ''}`);
	}

	sendRequest(userId: string) {
		return api<{ friendship: unknown; status: string }>(`/friends/request/${userId}`, {
			method: 'POST',
		});
	}

	acceptRequest(userId: string) {
		return api<{ friendship: unknown }>(`/friends/accept/${userId}`, {
			method: 'POST',
		});
	}

	declineRequest(userId: string) {
		return api<{ friendship: unknown }>(`/friends/decline/${userId}`, {
			method: 'POST',
		});
	}

	cancelRequest(userId: string) {
		return api<{ success: boolean }>(`/friends/request/${userId}`, {
			method: 'DELETE',
		});
	}

	removeFriend(userId: string) {
		return api<{ success: boolean }>(`/friends/${userId}`, {
			method: 'DELETE',
		});
	}
}

export const friendsService = new FriendsService();
