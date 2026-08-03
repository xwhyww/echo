import type { WSContext } from 'hono/ws';

// userId -> set of sockets (user can have multiple tabs/devices)
const connections = new Map<string, Set<WSContext>>();

// Privacy cache: userId -> 'all' | 'friends' | 'nobody'
const privacyCache = new Map<string, string>();
// Friends cache: userId -> set of friend userIds
const friendsCache = new Map<string, Set<string>>();

// Callback for publishing NATS presence when privacy changes
let onPresenceChange: ((userId: string, online: boolean) => void) | null = null;
export function setPresenceCallback(cb: (userId: string, online: boolean) => void) { onPresenceChange = cb; }

export function setUserPrivacy(userId: string, value: string) {
	const oldValue = privacyCache.get(userId) ?? 'all';
	privacyCache.set(userId, value);

	if (!connections.has(userId)) return;
	if (oldValue === value) return;

	const friends = getUserFriends(userId);
	const onlineEvent = JSON.stringify({ type: 'presence', userId, online: true });
	const offlineEvent = JSON.stringify({ type: 'presence', userId, online: false });

	// Determine who could see us before and who can see us now
	function canSee(privacy: string, uid: string): boolean {
		if (privacy === 'all') return true;
		if (privacy === 'friends') return friends.has(uid);
		return false; // nobody
	}

	for (const [uid, sockets] of connections) {
		if (uid === userId) continue;
		const couldSee = canSee(oldValue, uid);
		const canNow = canSee(value, uid);
		if (couldSee && !canNow) {
			for (const ws of sockets) ws.send(offlineEvent);
		} else if (!couldSee && canNow) {
			for (const ws of sockets) ws.send(onlineEvent);
		}
	}

	// Update DB caches: if nobody can see us, mark offline; otherwise mark online
	if (value === 'nobody') {
		onPresenceChange?.(userId, false);
	} else if (oldValue === 'nobody') {
		onPresenceChange?.(userId, true);
	}
}
export function getUserPrivacy(userId: string): string { return privacyCache.get(userId) ?? 'all'; }
export function setUserFriends(userId: string, friends: Set<string>) { friendsCache.set(userId, friends); }
export function getUserFriends(userId: string): Set<string> { return friendsCache.get(userId) ?? new Set(); }

export function addFriendPair(userA: string, userB: string) {
	if (!friendsCache.has(userA)) friendsCache.set(userA, new Set());
	if (!friendsCache.has(userB)) friendsCache.set(userB, new Set());
	friendsCache.get(userA)!.add(userB);
	friendsCache.get(userB)!.add(userA);
}

export function removeFriendPair(userA: string, userB: string) {
	friendsCache.get(userA)?.delete(userB);
	friendsCache.get(userB)?.delete(userA);
}

export function clearUserCaches(userId: string) {
	privacyCache.delete(userId);
	friendsCache.delete(userId);
}

export function addConnection(userId: string, ws: WSContext) {
	if (!connections.has(userId)) {
		connections.set(userId, new Set());
	}
	connections.get(userId)!.add(ws);
}

export function removeConnection(userId: string, ws: WSContext) {
	const sockets = connections.get(userId);
	if (!sockets) return;
	sockets.delete(ws);
	if (sockets.size === 0) {
		connections.delete(userId);
	}
}

export function isUserOnline(userId: string): boolean {
	return connections.has(userId);
}

export function sendToUser(userId: string, event: Record<string, unknown>) {
	const sockets = connections.get(userId);
	if (!sockets) return;
	const data = JSON.stringify(event);
	for (const ws of sockets) {
		ws.send(data);
	}
}

export function broadcastPresence(userId: string, online: boolean) {
	const privacy = getUserPrivacy(userId);
	if (privacy === 'nobody') return; // Don't broadcast at all

	const friends = getUserFriends(userId);
	const event = JSON.stringify({ type: 'presence', userId, online });

	for (const [uid, sockets] of connections) {
		if (uid === userId) continue;
		if (privacy === 'friends' && !friends.has(uid)) continue;
		for (const ws of sockets) {
			ws.send(event);
		}
	}
}

export function broadcastExcept(excludeUserId: string, event: Record<string, unknown>) {
	const data = JSON.stringify(event);
	for (const [uid, sockets] of connections) {
		if (uid === excludeUserId) continue;
		for (const ws of sockets) {
			ws.send(data);
		}
	}
}

// Broadcast an event authored by `senderUserId`, respecting their online-status
// privacy setting. `nobody` → no recipients; `friends` → friends only; `all` → all.
export function broadcastFromUser(senderUserId: string, event: Record<string, unknown>) {
	const privacy = getUserPrivacy(senderUserId);
	if (privacy === 'nobody') return;
	const friends = getUserFriends(senderUserId);
	const data = JSON.stringify(event);
	for (const [uid, sockets] of connections) {
		if (uid === senderUserId) continue;
		if (privacy === 'friends' && !friends.has(uid)) continue;
		for (const ws of sockets) {
			ws.send(data);
		}
	}
}

export function getConnections() {
	return connections;
}
