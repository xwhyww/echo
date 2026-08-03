import { friendsService, type FriendshipStatus } from '$lib/api/friendsService.js';

const LRU_CAPACITY = 128;

let cache = $state<Map<string, FriendshipStatus>>(new Map());
let incomingCount = $state(0);
let initialized = $state(false);
const inFlight = new Map<string, Promise<FriendshipStatus>>();

function isIncomingPending(s: FriendshipStatus | undefined): boolean {
	return !!s && s.status === 'pending' && s.direction === 'incoming';
}

function touch(userId: string, status: FriendshipStatus) {
	if (cache.has(userId)) cache.delete(userId);
	cache.set(userId, status);
	while (cache.size > LRU_CAPACITY) {
		const oldest = cache.keys().next().value;
		if (oldest === undefined) break;
		cache.delete(oldest);
	}
	cache = new Map(cache);
}

export const friendsStore = {
	get incomingCount() { return incomingCount; },
	get initialized() { return initialized; },

	getStatus(userId: string): FriendshipStatus | null {
		return cache.get(userId) ?? null;
	},

	async loadStatus(userId: string): Promise<FriendshipStatus> {
		const cached = cache.get(userId);
		if (cached) return cached;
		const existing = inFlight.get(userId);
		if (existing) return existing;
		const p = friendsService.getStatus(userId)
			.then((s) => {
				touch(userId, s);
				return s;
			})
			.catch(() => {
				const fallback: FriendshipStatus = { status: 'none' };
				return fallback;
			})
			.finally(() => {
				inFlight.delete(userId);
			});
		inFlight.set(userId, p);
		return p;
	},

	setStatus(userId: string, status: FriendshipStatus) {
		const prev = cache.get(userId);
		const wasIncoming = isIncomingPending(prev);
		const isIncoming = isIncomingPending(status);
		if (status.status === 'none') {
			if (cache.has(userId)) {
				cache.delete(userId);
				cache = new Map(cache);
			} else {
				touch(userId, status);
			}
		} else {
			touch(userId, status);
		}
		if (wasIncoming && !isIncoming) incomingCount = Math.max(0, incomingCount - 1);
		else if (!wasIncoming && isIncoming) incomingCount = incomingCount + 1;
	},

	removeStatus(userId: string) {
		const prev = cache.get(userId);
		if (isIncomingPending(prev)) incomingCount = Math.max(0, incomingCount - 1);
		if (cache.has(userId)) {
			cache.delete(userId);
			cache = new Map(cache);
		}
	},

	async init() {
		if (initialized) return;
		try {
			const { count } = await friendsService.getIncomingCount();
			incomingCount = count;
		} catch {
			incomingCount = 0;
		}
		initialized = true;
	},

	reset() {
		cache = new Map();
		incomingCount = 0;
		initialized = false;
		inFlight.clear();
	},
};
