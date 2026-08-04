import { sql } from 'drizzle-orm';
import type { Database } from './db/index.js';
import { userCache, groupMembersMirror } from './db/schema.js';
import { config } from './config.js';
import { log } from './log.js';

const RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const INSERT_BATCH = 5000;

interface UserRow {
	id: string;
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
}

interface MemberRow {
	groupId: string;
	userId: string;
	role: string;
	joinedAt: string;
}

async function fetchWithRetries<T>(label: string, url: string): Promise<T | null> {
	const delays = [500, 1000, 2000, 4000, 8000, 15000, 15000, 15000];
	for (let attempt = 0; attempt <= delays.length; attempt++) {
		try {
			const r = await fetch(url, { headers: { 'X-Internal-Key': config.internalApiKey } });
			if (r.ok) return (await r.json()) as T;
			log.warn({ label, status: r.status, attempt: attempt + 1 }, 'bootstrap fetch returned an error');
		} catch (err) {
			log.warn({ label, err, attempt: attempt + 1 }, 'bootstrap fetch unreachable');
		}
		if (attempt === delays.length) {
			log.error({ label }, 'bootstrap fetch giving up after retries');
			return null;
		}
		await new Promise((r) => setTimeout(r, delays[attempt]));
	}
	return null;
}

async function reconcileUserCache(db: Database): Promise<number> {
	const data = await fetchWithRetries<{ users?: UserRow[] }>(
		'reconcile users',
		`${config.userServiceUrl}/internal/users-snapshot`,
	);
	const users = Array.isArray(data?.users) ? data.users : [];
	if (users.length === 0) return 0;

	const rows = users
		.filter((u) => u && typeof u.id === 'string' && typeof u.username === 'string')
		.map((u) => ({
			id: u.id,
			username: u.username,
			displayName: u.displayName,
			avatarUrl: u.avatarUrl,
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
					updatedAt: sql`now()`,
				},
			});
	}
	return rows.length;
}

async function reconcileGroupMembers(db: Database): Promise<number> {
	const data = await fetchWithRetries<{ members?: MemberRow[] }>(
		'reconcile group members',
		`${config.groupsServiceUrl}/internal/group-members-detailed`,
	);
	const members = Array.isArray(data?.members) ? data.members : [];
	if (members.length === 0) return 0;

	const rows = members
		.filter((m) => m && m.groupId && m.userId)
		.map((m) => ({
			groupId: m.groupId,
			userId: m.userId,
			role: m.role,
			joinedAt: new Date(m.joinedAt),
		}));

	for (let i = 0; i < rows.length; i += INSERT_BATCH) {
		const batch = rows.slice(i, i + INSERT_BATCH);
		await db
			.insert(groupMembersMirror)
			.values(batch)
			.onConflictDoUpdate({
				target: [groupMembersMirror.groupId, groupMembersMirror.userId],
				set: { role: sql`excluded.role` },
			});
	}
	return rows.length;
}

export async function bootstrapCaches(db: Database): Promise<void> {
	const start = Date.now();
	const [users, members] = await Promise.all([
		reconcileUserCache(db).catch((err) => {
			log.error({ err }, 'bootstrap users failed');
			return 0;
		}),
		reconcileGroupMembers(db).catch((err) => {
			log.error({ err }, 'bootstrap group members failed');
			return 0;
		}),
	]);
	log.info({ users, members, durationMs: Date.now() - start }, 'bootstrap: hydrated caches');
}

export function startCacheReconciler(db: Database): void {
	setInterval(() => {
		void bootstrapCaches(db).catch((err) => {
			log.error({ err }, 'reconciler tick failed');
		});
	}, RECONCILE_INTERVAL_MS).unref();
}
