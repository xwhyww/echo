import { sql } from 'drizzle-orm';
import type { Database } from './db/index.js';
import { userCache } from './db/schema.js';
import { config } from './config.js';
import { log } from './log.js';

const RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000;
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
	privacyGroupInvite: string;
}

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
			privacyGroupInvite: u.privacyGroupInvite ?? 'all',
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
					privacyGroupInvite: sql`excluded.privacy_group_invite`,
					updatedAt: sql`now()`,
				},
			});
	}

	return rows.length;
}

export async function bootstrapCaches(db: Database): Promise<void> {
	const start = Date.now();
	const users = await reconcileUserCache(db).catch((err) => {
		log.error({ err }, 'bootstrap user_cache failed');
		return 0;
	});
	log.info({ users, durationMs: Date.now() - start }, 'bootstrap: hydrated user cache');
}

export function startCacheReconciler(db: Database): void {
	setInterval(() => {
		void bootstrapCaches(db).catch((err) => {
			log.error({ err }, 'reconciler tick failed');
		});
	}, RECONCILE_INTERVAL_MS).unref();
}
