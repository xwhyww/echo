import type { Database } from './db/index.js';
import { dmChatMembers, groupMembersMirror } from './db/schema.js';
import { config } from './config.js';

interface MembershipRow {
	chatId: string;
	userIds: string[];
}

interface GroupMembershipRow {
	groupId: string;
	userIds: string[];
}

const INSERT_BATCH = 5000;

// Pull every DM chat membership from pers-chats-service and bulk-insert into
// the local mirror. Runs on every blob-service start: idempotent via
// onConflictDoNothing, so it doubles as drift recovery. Cheap relative to
// JetStream replay because it's a single bulk-insert per batch.
export async function bootstrapDmChatMembers(db: Database): Promise<void> {
	const start = Date.now();
	let resp: Response | null = null;
	// Retry with backoff — pers-chats-service may still be booting when blob-service starts.
	// Skipping bootstrap silently leaves the mirror empty and every chat grant 403s,
	// which then orphans freshly-uploaded blobs.
	const delays = [500, 1000, 2000, 4000, 8000, 15000, 15000, 15000];
	for (let attempt = 0; attempt <= delays.length; attempt++) {
		try {
			const r = await fetch(`${config.persChatsServiceUrl}/internal/dm-memberships`, {
				headers: { 'X-Internal-Key': config.internalApiKey },
			});
			if (r.ok) {
				resp = r;
				break;
			}
			console.warn(`[blob-service] bootstrap: pers-chats-service returned ${r.status}, attempt ${attempt + 1}`);
		} catch (err) {
			console.warn(`[blob-service] bootstrap: pers-chats-service unreachable, attempt ${attempt + 1}:`, (err as Error).message);
		}
		if (attempt === delays.length) {
			console.error('[blob-service] bootstrap: giving up after retries, mirror will be empty until NATS events arrive');
			return;
		}
		await new Promise((r) => setTimeout(r, delays[attempt]));
	}
	if (!resp) return;

	const data = (await resp.json()) as { memberships?: MembershipRow[] };
	const memberships = Array.isArray(data?.memberships) ? data.memberships : [];

	if (memberships.length === 0) {
		console.log('[blob-service] bootstrap: no chats to hydrate');
		return;
	}

	const rows: { chatId: string; userId: string }[] = [];
	for (const m of memberships) {
		if (!m?.chatId || !Array.isArray(m.userIds)) continue;
		for (const u of m.userIds) {
			if (typeof u === 'string' && u.length > 0) {
				rows.push({ chatId: m.chatId, userId: u });
			}
		}
	}

	for (let i = 0; i < rows.length; i += INSERT_BATCH) {
		const batch = rows.slice(i, i + INSERT_BATCH);
		await db.insert(dmChatMembers).values(batch).onConflictDoNothing();
	}

	console.log(
		`[blob-service] bootstrap: hydrated ${rows.length} memberships across ${memberships.length} chats in ${Date.now() - start}ms`,
	);
}

// Same shape as bootstrapDmChatMembers but for groups. groups-service exposes
// /internal/group-memberships returning every group with its member ids.
export async function bootstrapGroupMembers(db: Database): Promise<void> {
	const start = Date.now();
	let resp: Response | null = null;
	const delays = [500, 1000, 2000, 4000, 8000, 15000, 15000, 15000];
	for (let attempt = 0; attempt <= delays.length; attempt++) {
		try {
			const r = await fetch(`${config.groupsServiceUrl}/internal/group-memberships`, {
				headers: { 'X-Internal-Key': config.internalApiKey },
			});
			if (r.ok) {
				resp = r;
				break;
			}
			console.warn(`[blob-service] bootstrap groups: groups-service returned ${r.status}, attempt ${attempt + 1}`);
		} catch (err) {
			console.warn(`[blob-service] bootstrap groups: groups-service unreachable, attempt ${attempt + 1}:`, (err as Error).message);
		}
		if (attempt === delays.length) {
			console.error('[blob-service] bootstrap groups: giving up, mirror will be empty until NATS events arrive');
			return;
		}
		await new Promise((r) => setTimeout(r, delays[attempt]));
	}
	if (!resp) return;

	const data = (await resp.json()) as { memberships?: GroupMembershipRow[] };
	const memberships = Array.isArray(data?.memberships) ? data.memberships : [];

	if (memberships.length === 0) {
		console.log('[blob-service] bootstrap groups: no groups to hydrate');
		return;
	}

	const rows: { groupId: string; userId: string }[] = [];
	for (const m of memberships) {
		if (!m?.groupId || !Array.isArray(m.userIds)) continue;
		for (const u of m.userIds) {
			if (typeof u === 'string' && u.length > 0) {
				rows.push({ groupId: m.groupId, userId: u });
			}
		}
	}

	for (let i = 0; i < rows.length; i += INSERT_BATCH) {
		const batch = rows.slice(i, i + INSERT_BATCH);
		await db.insert(groupMembersMirror).values(batch).onConflictDoNothing();
	}

	console.log(
		`[blob-service] bootstrap groups: hydrated ${rows.length} memberships across ${memberships.length} groups in ${Date.now() - start}ms`,
	);
}
