import { Hono } from 'hono';
import { and, eq, lt, gt, gte, desc, asc, inArray, isNotNull, sql } from 'drizzle-orm';
import { authMiddleware, type AuthEnv, type DmReactionSummary } from '@echo/shared';
import { createDb } from '../db/index.js';
import {
	groups, groupMembers, groupMessages, groupChatReads,
	groupMessageReactions, userCache, groupMessageLinks,
} from '../db/schema.js';
import { randomUUID } from 'node:crypto';
import { attachmentHashesFromRow } from '@echo/shared';
import { config } from '../config.js';
import { encryptForInsert, decryptRow, stripCiphertext } from '../crypto.js';
import { can, canMessage, canPin, type Role, type MessagePolicy, type PinPolicy } from '../permissions.js';
import {
	publishGroupMessage, publishGroupMessageEdited, publishGroupMessageDeleted,
	publishGroupMessagePinned, publishGroupMessageUnpinned, publishGroupMessageReaction,
	publishGroupRead,
} from '../nats.js';
import { log } from '../log.js';

const db = createDb(config.databaseUrl);
export const messagesRoutes = new Hono<AuthEnv>();
messagesRoutes.use('*', authMiddleware(config.jwtSecret));

const URL_REGEX = /https?:\/\/[^\s)>\]]+/g;
const MAX_FILES_PER_MESSAGE = 5;
const MAX_UNIQUE_REACTIONS_PER_MESSAGE = 10;
const PAGE_LIMIT = 50;

function extractAttachmentHashes(attachments: unknown): string[] {
	if (!Array.isArray(attachments)) return [];
	const hashes: string[] = [];
	for (const a of attachments) {
		const h = a && typeof a === 'object' && 'hash' in a ? (a as { hash?: string }).hash : null;
		if (h) hashes.push(h);
	}
	return hashes;
}

function bearerToken(c: { req: { header: (k: string) => string | undefined } }): string | null {
	const h = c.req.header('Authorization');
	return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

async function addGroupGrants(hashes: string[], groupId: string, token: string): Promise<void> {
	if (hashes.length === 0 || !token) return;
	try {
		const r = await fetch(`${config.blobServiceUrl}/blobs/grants`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
			body: JSON.stringify({ scopeType: 'group', scopeId: groupId, hashes }),
		});
		if (!r.ok) log.error({ status: r.status, groupId }, 'addGroupGrants failed');
	} catch (err) {
		log.error({ err }, 'addGroupGrants threw');
	}
}

async function removePendingGrants(hashes: string[], userId: string, token: string): Promise<void> {
	if (hashes.length === 0 || !token) return;
	await fetch(`${config.blobServiceUrl}/blobs/grants`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ scopeType: 'pending', scopeId: userId, hashes }),
	}).catch(() => {});
}

// Remove the group grant for each hash that no live message in this group
// still references. Per-(hash, group), so shared attachments keep the grant
// until every referencing message is gone.
async function removeGroupGrantsIfUnused(hashes: string[], groupId: string, token: string): Promise<void> {
	if (hashes.length === 0 || !token) return;

	const toRemove: string[] = [];
	for (const h of hashes) {
		const found = await db
			.select({ one: sql<number>`1` })
			.from(groupMessages)
			.where(
				and(
					eq(groupMessages.groupId, groupId),
					// COALESCE because attachments moved into the ciphertext: new rows
					// answer from attachments_meta, rows older than the migration
					// still from attachments.
					sql`COALESCE(${groupMessages.attachmentsMeta}, ${groupMessages.attachments}) @> ${JSON.stringify([{ hash: h }])}::jsonb`,
				),
			)
			.limit(1);
		if (found.length === 0) toRemove.push(h);
	}

	if (toRemove.length === 0) return;
	await fetch(`${config.blobServiceUrl}/blobs/grants`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ scopeType: 'group', scopeId: groupId, hashes: toRemove }),
	}).catch(() => {});
}

async function membership(groupId: string, userId: string): Promise<Role | null> {
	const [m] = await db
		.select({ role: groupMembers.role })
		.from(groupMembers)
		.where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
		.limit(1);
	return (m?.role as Role) ?? null;
}

async function membershipDetail(groupId: string, userId: string): Promise<{ role: Role; joinedAt: Date } | null> {
	const [m] = await db
		.select({ role: groupMembers.role, joinedAt: groupMembers.joinedAt })
		.from(groupMembers)
		.where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
		.limit(1);
	return m ? { role: m.role as Role, joinedAt: m.joinedAt } : null;
}

async function groupPolicies(groupId: string): Promise<{
	messagePolicy: MessagePolicy;
	pinPolicy: PinPolicy;
	historyVisible: boolean;
} | null> {
	const [g] = await db
		.select({
			messagePolicy: groups.messagePolicy,
			pinPolicy: groups.pinPolicy,
			historyVisible: groups.historyVisible,
		})
		.from(groups).where(eq(groups.id, groupId)).limit(1);
	return g ? {
		messagePolicy: g.messagePolicy as MessagePolicy,
		pinPolicy: g.pinPolicy as PinPolicy,
		historyVisible: g.historyVisible,
	} : null;
}

async function listMemberIds(groupId: string): Promise<string[]> {
	const rows = await db
		.select({ userId: groupMembers.userId })
		.from(groupMembers)
		.where(eq(groupMembers.groupId, groupId));
	return rows.map((r) => r.userId);
}

async function authorSummary(id: string) {
	const [u] = await db
		.select({ id: userCache.id, username: userCache.username, displayName: userCache.displayName, avatarUrl: userCache.avatarUrl })
		.from(userCache).where(eq(userCache.id, id)).limit(1);
	return u ?? { id, username: '', displayName: null, avatarUrl: null };
}

async function getReactionsForMessages(messageIds: string[]): Promise<Record<string, DmReactionSummary[]>> {
	const out: Record<string, DmReactionSummary[]> = {};
	if (messageIds.length === 0) return out;
	const rows = await db
		.select({
			messageId: groupMessageReactions.messageId,
			emoji: groupMessageReactions.emoji,
			userId: groupMessageReactions.userId,
			createdAt: groupMessageReactions.createdAt,
		})
		.from(groupMessageReactions)
		.where(inArray(groupMessageReactions.messageId, messageIds))
		.orderBy(groupMessageReactions.createdAt);
	for (const r of rows) {
		const perMsg = (out[r.messageId] ??= []);
		let bucket = perMsg.find((b) => b.emoji === r.emoji);
		if (!bucket) {
			bucket = { emoji: r.emoji, count: 0, userIds: [], reactedAts: [] };
			perMsg.push(bucket);
		}
		bucket.count += 1;
		bucket.userIds.push(r.userId);
		bucket.reactedAts.push(r.createdAt.toISOString());
	}
	return out;
}

async function syncMessageLinks(messageId: string, groupId: string, content: string, createdAt: Date) {
	await db.delete(groupMessageLinks).where(eq(groupMessageLinks.messageId, messageId));
	// Deduplicated: the same URL pasted twice in one message is one link in the
	// gallery, not two rows.
	const urls = [...new Set(content.match(URL_REGEX) ?? [])];
	if (urls.length > 0) {
		await db.insert(groupMessageLinks).values(
			urls.map((url) => ({ messageId, groupId, url, createdAt })),
		);
	}
}

// The single point where a stored row becomes something a client sees, and so
// the single place that has to decrypt. Callers hand it whatever came back from
// the database; rows written before the migration have no ciphertext and pass
// through untouched.
function serializeMessage(row: typeof groupMessages.$inferSelect, author: Awaited<ReturnType<typeof authorSummary>>, reactions: DmReactionSummary[]) {
	const plain = decryptRow(row);
	return {
		id: plain.id,
		groupId: plain.groupId,
		authorId: plain.authorId,
		content: plain.content,
		attachments: plain.attachments ?? [],
		isEdited: plain.isEdited,
		createdAt: plain.createdAt.toISOString(),
		updatedAt: plain.updatedAt.toISOString(),
		pinnedAt: plain.pinnedAt ? plain.pinnedAt.toISOString() : null,
		pinnedBy: plain.pinnedBy,
		systemKind: plain.systemKind,
		replyToId: plain.replyToId,
		replyToSnapshot: plain.replyToSnapshot,
		forwardedFrom: plain.forwardedFrom,
		author,
		reactions,
	};
}

// ─── Send message ───────────────────────────────────────────────

messagesRoutes.post('/:id/messages', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const role = await membership(id, me.userId);
	if (!role) return c.json({ error: 'forbidden' }, 403);

	const policies = await groupPolicies(id);
	if (!policies) return c.json({ error: 'group not found' }, 404);
	if (!canMessage(role, policies.messagePolicy)) return c.json({ error: 'forbidden' }, 403);

	const body = await c.req.json().catch(() => ({}));
	const content = (body?.content ?? '').toString();
	const attachments = Array.isArray(body?.attachments) ? body.attachments : [];
	const replyToId = body?.replyToId ? String(body.replyToId) : null;

	let forwardedFrom: unknown = null;
	if (body?.forwardedFrom && typeof body.forwardedFrom === 'object') {
		const f = body.forwardedFrom as { authorId?: unknown; authorName?: unknown; content?: unknown; attachments?: unknown };
		if (typeof f.authorId === 'string' && typeof f.authorName === 'string' && typeof f.content === 'string') {
			forwardedFrom = {
				authorId: f.authorId,
				authorName: f.authorName,
				content: f.content,
				attachments: Array.isArray(f.attachments) ? f.attachments : [],
			};
		}
	}

	if (!content.trim() && attachments.length === 0) return c.json({ error: 'empty message' }, 400);
	if (attachments.length > MAX_FILES_PER_MESSAGE) return c.json({ error: `max ${MAX_FILES_PER_MESSAGE} files` }, 400);

	let replyToSnapshot: unknown = null;
	if (replyToId) {
		// The whole row, not a projection: decrypting needs the id (it is the AAD)
		// and the ciphertext columns, and listing them out here would be one more
		// place to forget when a column is added.
		const [reply] = await db
			.select()
			.from(groupMessages)
			.where(and(eq(groupMessages.id, replyToId), eq(groupMessages.groupId, id)))
			.limit(1);
		if (reply) {
			const plainReply = decryptRow(reply);
			const authorName = (await authorSummary(plainReply.authorId)).username;
			const att = Array.isArray(plainReply.attachments) ? plainReply.attachments : [];
			replyToSnapshot = {
				authorId: plainReply.authorId,
				authorName,
				content: (plainReply.content ?? '').slice(0, 200),
				attachmentType: att[0]?.mimeType ?? null,
			};
		}
	}

	// The id is generated here rather than by the default, because it is the
	// AAD binding each ciphertext to this row — it has to exist before the
	// encryption, not after the insert.
	const messageId = randomUUID();
	const enc = encryptForInsert(messageId, { content, attachments, replyToSnapshot });

	const [msg] = await db.insert(groupMessages).values({
		id: messageId,
		groupId: id,
		authorId: me.userId,
		// The plaintext columns stay in the table for rows older than the
		// migration; a new row leaves them empty and lives in the ciphertext.
		content: '',
		attachments: [],
		replyToId,
		replyToSnapshot: null,
		forwardedFrom,
		...enc,
	}).returning();

	const hashes = extractAttachmentHashes(attachments);
	if (hashes.length > 0) {
		const token = bearerToken(c) ?? '';
		await addGroupGrants(hashes, id, token);
		void removePendingGrants(hashes, me.userId, token);
	}

	await syncMessageLinks(msg.id, id, content, msg.createdAt);

	const author = await authorSummary(me.userId);
	const memberIds = await listMemberIds(id);

	// Serialised from the plaintext we already hold rather than by decrypting
	// what we just wrote — same values, one fewer round of crypto.
	const payload = serializeMessage(
		{ ...msg, content, attachments, replyToSnapshot },
		author,
		[],
	);
	void publishGroupMessage({
		targetUserIds: memberIds,
		groupId: id,
		message: {
			id: payload.id,
			groupId: payload.groupId,
			authorId: payload.authorId,
			content: payload.content,
			attachments: payload.attachments as any,
			isEdited: payload.isEdited,
			createdAt: payload.createdAt,
			systemKind: payload.systemKind,
			replyToId: payload.replyToId,
			replyToSnapshot: payload.replyToSnapshot as any,
			forwardedFrom: payload.forwardedFrom as any,
			author: payload.author,
		},
	});

	return c.json({ message: payload }, 201);
});

// ─── Paginated message history ──────────────────────────────────

messagesRoutes.get('/:id/messages', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const detail = await membershipDetail(id, me.userId);
	if (!detail) return c.json({ error: 'not a member' }, 403);

	const policies = await groupPolicies(id);
	if (!policies) return c.json({ error: 'group not found' }, 404);

	const cursor = c.req.query('cursor'); // ISO before
	const after = c.req.query('after');   // ISO after
	const limit = Math.min(Number(c.req.query('limit')) || PAGE_LIMIT, 100);

	const baseConds = [eq(groupMessages.groupId, id)];
	if (cursor) baseConds.push(lt(groupMessages.createdAt, new Date(cursor)));
	if (after) baseConds.push(gt(groupMessages.createdAt, new Date(after)));
	if (!policies.historyVisible && detail.role !== 'owner') {
		baseConds.push(gte(groupMessages.createdAt, detail.joinedAt));
	}

	const rows = await db
		.select()
		.from(groupMessages)
		.where(and(...baseConds))
		.orderBy(after ? asc(groupMessages.createdAt) : desc(groupMessages.createdAt))
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	if (hasMore) rows.pop();

	const ordered = after ? rows : rows.slice().reverse();
	const authorIds = [...new Set(ordered.map((r) => r.authorId))];
	const authors = new Map<string, Awaited<ReturnType<typeof authorSummary>>>();
	if (authorIds.length > 0) {
		const aRows = await db
			.select({ id: userCache.id, username: userCache.username, displayName: userCache.displayName, avatarUrl: userCache.avatarUrl })
			.from(userCache).where(inArray(userCache.id, authorIds));
		for (const a of aRows) authors.set(a.id, a);
	}
	const reactionsMap = await getReactionsForMessages(ordered.map((r) => r.id));

	const messages = ordered.map((r) => serializeMessage(
		r,
		authors.get(r.authorId) ?? { id: r.authorId, username: '', displayName: null, avatarUrl: null },
		reactionsMap[r.id] ?? [],
	));

	const nextCursor = hasMore && ordered.length > 0 ? ordered[0].createdAt.toISOString() : null;

	return c.json({ messages, hasMore, nextCursor });
});

// ─── Edit own message ───────────────────────────────────────────

messagesRoutes.patch('/messages/:messageId', async (c) => {
	const me = c.get('user');
	const messageId = c.req.param('messageId');

	const [msg] = await db.select().from(groupMessages).where(eq(groupMessages.id, messageId)).limit(1);
	if (!msg) return c.json({ error: 'message not found' }, 404);
	if (msg.authorId !== me.userId) return c.json({ error: 'can only edit own messages' }, 403);

	const role = await membership(msg.groupId, me.userId);
	if (!role) return c.json({ error: 'not a member' }, 403);

	const previous = decryptRow(msg);
	const body = await c.req.json().catch(() => ({}));
	const content = body?.content !== undefined ? String(body.content) : (previous.content ?? '');
	const attachments = Array.isArray(body?.attachments) ? body.attachments : previous.attachments;

	// From the meta column where it exists, so a row whose attachments are
	// already encrypted still reconciles its blob grants correctly.
	const oldHashes = attachmentHashesFromRow(msg);
	const newHashes = extractAttachmentHashes(attachments);

	// Re-encrypted under the same message id, so the AAD still binds to this row.
	const enc = encryptForInsert(messageId, { content, attachments, replyToSnapshot: previous.replyToSnapshot });

	const [updated] = await db.update(groupMessages)
		.set({ content: '', attachments: [], isEdited: true, updatedAt: new Date(), ...enc })
		.where(eq(groupMessages.id, messageId))
		.returning();

	const token = bearerToken(c) ?? '';
	const added = newHashes.filter((h) => !oldHashes.includes(h));
	const removed = oldHashes.filter((h) => !newHashes.includes(h));
	if (added.length > 0) {
		await addGroupGrants(added, msg.groupId, token);
		void removePendingGrants(added, me.userId, token);
	}
	if (removed.length > 0) void removeGroupGrantsIfUnused(removed, msg.groupId, token);

	await syncMessageLinks(messageId, msg.groupId, content, updated.createdAt);

	const memberIds = await listMemberIds(msg.groupId);
	void publishGroupMessageEdited({
		targetUserIds: memberIds,
		groupId: msg.groupId,
		messageId,
		content,
		attachments: attachments as any,
		updatedAt: updated.updatedAt.toISOString(),
	});

	return c.json({ message: { ...stripCiphertext(updated), content, attachments } });
});

// ─── Delete message (own, or any if admin+) ─────────────────────

messagesRoutes.delete('/messages/:messageId', async (c) => {
	const me = c.get('user');
	const messageId = c.req.param('messageId');

	const [msg] = await db.select().from(groupMessages).where(eq(groupMessages.id, messageId)).limit(1);
	if (!msg) return c.json({ error: 'message not found' }, 404);

	const role = await membership(msg.groupId, me.userId);
	if (!role) return c.json({ error: 'not a member' }, 403);

	const isOwn = msg.authorId === me.userId;
	if (!isOwn && !can(role, 'message.delete_any')) return c.json({ error: 'forbidden' }, 403);

	const removedHashes = attachmentHashesFromRow(msg);
	await db.delete(groupMessages).where(eq(groupMessages.id, messageId));

	if (removedHashes.length > 0) {
		void removeGroupGrantsIfUnused(removedHashes, msg.groupId, bearerToken(c) ?? '');
	}

	const memberIds = await listMemberIds(msg.groupId);
	void publishGroupMessageDeleted({ targetUserIds: memberIds, groupId: msg.groupId, messageId });

	return c.json({ success: true });
});

// ─── Mark group as read ─────────────────────────────────────────

messagesRoutes.post('/:id/read', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const role = await membership(id, me.userId);
	if (!role) return c.json({ error: 'not a member' }, 403);

	const now = new Date();
	await db.insert(groupChatReads).values({
		groupId: id, userId: me.userId, lastReadAt: now,
	}).onConflictDoUpdate({
		target: [groupChatReads.userId, groupChatReads.groupId],
		set: { lastReadAt: now },
	});

	const memberIds = await listMemberIds(id);
	void publishGroupRead({
		targetUserIds: memberIds,
		groupId: id, userId: me.userId, lastReadAt: now.toISOString(),
	});

	return c.json({ success: true });
});

// ─── Pinned messages ────────────────────────────────────────────

messagesRoutes.get('/:id/pinned', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const detail = await membershipDetail(id, me.userId);
	if (!detail) return c.json({ error: 'not a member' }, 403);

	const policies = await groupPolicies(id);
	if (!policies) return c.json({ error: 'group not found' }, 404);

	const conds = [eq(groupMessages.groupId, id), isNotNull(groupMessages.pinnedAt)];
	if (!policies.historyVisible && detail.role !== 'owner') {
		conds.push(gte(groupMessages.createdAt, detail.joinedAt));
	}

	const rows = await db
		.select()
		.from(groupMessages)
		.where(and(...conds))
		.orderBy(desc(groupMessages.pinnedAt));

	const authorIds = [...new Set(rows.map((r) => r.authorId))];
	const authors = new Map<string, Awaited<ReturnType<typeof authorSummary>>>();
	if (authorIds.length > 0) {
		const aRows = await db
			.select({ id: userCache.id, username: userCache.username, displayName: userCache.displayName, avatarUrl: userCache.avatarUrl })
			.from(userCache).where(inArray(userCache.id, authorIds));
		for (const a of aRows) authors.set(a.id, a);
	}
	const reactionsMap = await getReactionsForMessages(rows.map((r) => r.id));

	const messages = rows.map((r) => serializeMessage(
		r,
		authors.get(r.authorId) ?? { id: r.authorId, username: '', displayName: null, avatarUrl: null },
		reactionsMap[r.id] ?? [],
	));

	return c.json({ messages });
});

messagesRoutes.post('/messages/:messageId/pin', async (c) => {
	const me = c.get('user');
	const messageId = c.req.param('messageId');

	const [msg] = await db.select().from(groupMessages).where(eq(groupMessages.id, messageId)).limit(1);
	if (!msg) return c.json({ error: 'message not found' }, 404);

	const role = await membership(msg.groupId, me.userId);
	if (!role) return c.json({ error: 'forbidden' }, 403);

	const policies = await groupPolicies(msg.groupId);
	if (!policies) return c.json({ error: 'group not found' }, 404);
	if (!canPin(role, policies.pinPolicy)) return c.json({ error: 'forbidden' }, 403);

	const now = new Date();
	await db.update(groupMessages)
		.set({ pinnedAt: now, pinnedBy: me.userId })
		.where(eq(groupMessages.id, messageId));

	const memberIds = await listMemberIds(msg.groupId);
	void publishGroupMessagePinned({
		targetUserIds: memberIds, groupId: msg.groupId, messageId,
		pinnedAt: now.toISOString(), pinnedBy: me.userId,
	});

	return c.json({ success: true, pinnedAt: now.toISOString(), pinnedBy: me.userId });
});

messagesRoutes.delete('/messages/:messageId/pin', async (c) => {
	const me = c.get('user');
	const messageId = c.req.param('messageId');

	const [msg] = await db.select().from(groupMessages).where(eq(groupMessages.id, messageId)).limit(1);
	if (!msg) return c.json({ error: 'message not found' }, 404);

	const role = await membership(msg.groupId, me.userId);
	if (!role) return c.json({ error: 'forbidden' }, 403);

	const policies = await groupPolicies(msg.groupId);
	if (!policies) return c.json({ error: 'group not found' }, 404);
	if (!canPin(role, policies.pinPolicy)) return c.json({ error: 'forbidden' }, 403);

	await db.update(groupMessages)
		.set({ pinnedAt: null, pinnedBy: null })
		.where(eq(groupMessages.id, messageId));

	const memberIds = await listMemberIds(msg.groupId);
	void publishGroupMessageUnpinned({ targetUserIds: memberIds, groupId: msg.groupId, messageId });

	return c.json({ success: true });
});

// ─── Reactions ──────────────────────────────────────────────────

messagesRoutes.post('/messages/:messageId/reactions', async (c) => {
	const me = c.get('user');
	const messageId = c.req.param('messageId');
	const body = await c.req.json().catch(() => ({}));
	const emoji = (body?.emoji ?? '').toString();
	if (!emoji) return c.json({ error: 'emoji required' }, 400);

	const [msg] = await db
		.select({ groupId: groupMessages.groupId, authorId: groupMessages.authorId })
		.from(groupMessages).where(eq(groupMessages.id, messageId)).limit(1);
	if (!msg) return c.json({ error: 'message not found' }, 404);

	const role = await membership(msg.groupId, me.userId);
	if (!role) return c.json({ error: 'not a member' }, 403);

	// Toggle: remove if exists, add otherwise. Enforce per-message unique-emoji cap.
	const [existing] = await db
		.select().from(groupMessageReactions)
		.where(and(eq(groupMessageReactions.messageId, messageId), eq(groupMessageReactions.userId, me.userId)))
		.limit(1);

	if (existing && existing.emoji === emoji) {
		await db.delete(groupMessageReactions).where(eq(groupMessageReactions.id, existing.id));
	} else if (existing) {
		await db.update(groupMessageReactions)
			.set({ emoji, createdAt: new Date() })
			.where(eq(groupMessageReactions.id, existing.id));
	} else {
		const [{ count: distinct }] = await db
			.select({ count: sql<number>`count(distinct ${groupMessageReactions.emoji})` })
			.from(groupMessageReactions)
			.where(eq(groupMessageReactions.messageId, messageId));
		const distinctEmojis = Number(distinct);
		const [{ exists }] = await db
			.select({ exists: sql<number>`count(*)` })
			.from(groupMessageReactions)
			.where(and(eq(groupMessageReactions.messageId, messageId), eq(groupMessageReactions.emoji, emoji)));
		if (Number(exists) === 0 && distinctEmojis >= MAX_UNIQUE_REACTIONS_PER_MESSAGE) {
			return c.json({ error: 'too many distinct reactions on this message' }, 409);
		}
		await db.insert(groupMessageReactions).values({
			messageId, userId: me.userId, emoji,
		});
	}

	const reactions = (await getReactionsForMessages([messageId]))[messageId] ?? [];
	const memberIds = await listMemberIds(msg.groupId);
	void publishGroupMessageReaction({
		targetUserIds: memberIds, groupId: msg.groupId, messageId,
		messageAuthorId: msg.authorId, reactions,
	});

	return c.json({ reactions });
});
