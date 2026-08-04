import { sql } from 'drizzle-orm';
import type { Database } from './db/index.js';
import { userCache, friendshipCache } from './db/schema.js';
import { config } from './config.js';
import { log } from './log.js';

const RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
const INSERT_BATCH = 5000;

interface UserRow {
	id: string;
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
	isOnline: boolean;
	privacyOnlineStatus: string;
	privacyMessaging: string;
	privacyPhoto: string;
}

interface FriendshipRow {
	id: string;
	requesterId: string;
	addresseeId: string;
	status: string;
}

// Pull every user_profiles row from user-service and upsert into user_cache.
// Used on cold start and by the periodic reconciler. Onerous-but-cheap: O(N
// users), runs once on startup and every 6h. Cheaper than a per-message
// freshness check on the read path.
async function reconcileUserCache(db: Database): Promise<number> {
	let resp: Response;
	try {
		resp = await fetch(`${config.userServiceUrl}/internal/users-snapshot`, {
			headers: { 'X-Internal-Key': config.internalApiKey },
		});
	} catch (err) {
		log.error({ err }, 'reconcile: user-service unreachable, skipping');
		return 0;
	}
	if (!resp.ok) {
		log.error({ status: resp.status }, 'reconcile: user-service returned an error, skipping');
		return 0;
	}

	const data = (await resp.json()) as { users?: UserRow[] };
	const users = Array.isArray(data?.users) ? data.users : [];
	if (users.length === 0) return 0;

	const rows = users
		.filter((u) => u && typeof u.id === 'string' && typeof u.username === 'string')
		.map((u) => ({
			id: u.id,
			username: u.username,
			displayName: u.displayName,
			avatarUrl: u.avatarUrl,
			isOnline: u.isOnline,
			privacyOnlineStatus: u.privacyOnlineStatus,
			privacyMessaging: u.privacyMessaging,
			privacyPhoto: u.privacyPhoto,
			updatedAt: new Date(),
		}));

	for (let i = 0; i < rows.length; i += INSERT_BATCH) {
		const batch = rows.slice(i, i + INSERT_BATCH);
		await db
			.insert(userCache)
			.values(batch)
			.onConflictDoUpdate({
				target: userCache.id,
				set: {
					username: sql`excluded.username`,
					displayName: sql`excluded.display_name`,
					avatarUrl: sql`excluded.avatar_url`,
					isOnline: sql`excluded.is_online`,
					privacyOnlineStatus: sql`excluded.privacy_online_status`,
					privacyMessaging: sql`excluded.privacy_messaging`,
					privacyPhoto: sql`excluded.privacy_photo`,
					updatedAt: sql`now()`,
				},
			});
	}

	return rows.length;
}

// Same shape for friendship_cache. Note: friendship_cache has no NATS writer
// today, so this bootstrap is currently the *only* path that populates it.
async function reconcileFriendshipCache(db: Database): Promise<number> {
	let resp: Response;
	try {
		resp = await fetch(`${config.friendsServiceUrl}/internal/friendships-snapshot`, {
			headers: { 'X-Internal-Key': config.internalApiKey },
		});
	} catch (err) {
		log.error({ err }, 'reconcile: friends-service unreachable, skipping');
		return 0;
	}
	if (!resp.ok) {
		log.error({ status: resp.status }, 'reconcile: friends-service returned an error, skipping');
		return 0;
	}

	const data = (await resp.json()) as { friendships?: FriendshipRow[] };
	const list = Array.isArray(data?.friendships) ? data.friendships : [];
	if (list.length === 0) return 0;

	// friendship_cache uses a sorted (user1Id, user2Id) unique index so the
	// pair is canonical regardless of who initiated. requesterId tracks the
	// original direction for outgoing/incoming display.
	const rows = list
		.filter((f) => f && typeof f.requesterId === 'string' && typeof f.addresseeId === 'string')
		.map((f) => {
			const [u1, u2] =
				f.requesterId < f.addresseeId
					? [f.requesterId, f.addresseeId]
					: [f.addresseeId, f.requesterId];
			return {
				user1Id: u1,
				user2Id: u2,
				status: f.status,
				requesterId: f.requesterId,
				updatedAt: new Date(),
			};
		});

	for (let i = 0; i < rows.length; i += INSERT_BATCH) {
		const batch = rows.slice(i, i + INSERT_BATCH);
		await db
			.insert(friendshipCache)
			.values(batch)
			.onConflictDoUpdate({
				target: [friendshipCache.user1Id, friendshipCache.user2Id],
				set: {
					status: sql`excluded.status`,
					requesterId: sql`excluded.requester_id`,
					updatedAt: sql`now()`,
				},
			});
	}

	return rows.length;
}

export async function bootstrapCaches(db: Database): Promise<void> {
	const start = Date.now();
	const [users, friendships] = await Promise.all([
		reconcileUserCache(db).catch((err) => {
			log.error({ err }, 'bootstrap user_cache failed');
			return 0;
		}),
		reconcileFriendshipCache(db).catch((err) => {
			log.error({ err }, 'bootstrap friendship_cache failed');
			return 0;
		}),
	]);
	log.info(
		{ users, friendships, durationMs: Date.now() - start },
		'bootstrap: hydrated caches',
	);
}

// Periodic drift recovery — catches events lost between NATS publish and
// consumer ack (network blips, consumer crashes mid-handler, etc). Cheap
// relative to the read-path savings; runs every 6h.
export function startCacheReconciler(db: Database): void {
	setInterval(() => {
		void bootstrapCaches(db).catch((err) => {
			log.error({ err }, 'reconciler tick failed');
		});
	}, RECONCILE_INTERVAL_MS).unref();
}
