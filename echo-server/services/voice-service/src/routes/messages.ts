import { Hono } from 'hono';
import { and, eq, lt, gt, desc, asc, inArray, isNotNull, sql } from 'drizzle-orm';
import { authMiddleware, type AuthEnv, type DmReactionSummary } from '@echo/shared';
import { createDb } from '../db/index.js';
import {
	voiceChannels, voiceChannelMessages, voiceChannelChatReads,
	voiceChannelMessageReactions, groupMembersMirror, userCache,
} from '../db/schema.js';
import { config } from '../config.js';
import {
	publishVoiceChannelMessage, publishVoiceChannelMessageEdited, publishVoiceChannelMessageDeleted,
	publishVoiceChannelMessagePinned, publishVoiceChannelMessageUnpinned,
	publishVoiceChannelMessageReaction, publishVoiceChannelRead,
} from '../nats.js';
import { log } from '../log.js';

const db = createDb(config.databaseUrl);
export const messagesRoutes = new Hono<AuthEnv>();
messagesRoutes.use('*', authMiddleware(config.jwtSecret));

const MAX_FILES_PER_MESSAGE = 5;
const MAX_UNIQUE_REACTIONS_PER_MESSAGE = 10;
const PAGE_LIMIT = 50;

type Role = 'owner' | 'admin' | 'member';

function bearerToken(c: { req: { header: (k: string) => string | undefined } }): string | null {
	const h = c.req.header('Authorization');
	return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

function extractAttachmentHashes(attachments: unknown): string[] {
	if (!Array.isArray(attachments)) return [];
	const hashes: string[] = [];
	for (const a of attachments) {
		const h = a && typeof a === 'object' && 'hash' in a ? (a as { hash?: string }).hash : null;
		if (h) hashes.push(h);
	}
	return hashes;
}

// Reuse the parent group's scope for blob grants — voice-channel members are
// always group members, so granting at the group level is the same access set
// and means we don't need a new scope_type in blob-service.
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

// Drop the group grant for each hash that no live group message and no live
// voice-channel message in this group still references. Group messages share
// the same group scope, so we only revoke when both queues are empty.
async function removeGroupGrantsIfUnused(hashes: string[], groupId: string, token: string): Promise<void> {
	if (hashes.length === 0 || !token) return;

	const toRemove: string[] = [];
	for (const h of hashes) {
		const found = await db
			.select({ one: sql<number>`1` })
			.from(voiceChannelMessages)
			.where(
				and(
					eq(voiceChannelMessages.groupId, groupId),
					sql`${voiceChannelMessages.attachments} @> ${JSON.stringify([{ hash: h }])}::jsonb`,
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

async function channelInfo(channelId: string): Promise<{ groupId: string } | null> {
	const [c] = await db
		.select({ groupId: voiceChannels.groupId })
		.from(voiceChannels)
		.where(eq(voiceChannels.id, channelId))
		.limit(1);
	return c ?? null;
}

async function membership(groupId: string, userId: string): Promise<Role | null> {
	const [m] = await db
		.select({ role: groupMembersMirror.role })
		.from(groupMembersMirror)
		.where(and(eq(groupMembersMirror.groupId, groupId), eq(groupMembersMirror.userId, userId)))
		.limit(1);
	return (m?.role as Role) ?? null;
}

async function listMemberIds(groupId: string): Promise<string[]> {
	const rows = await db
		.select({ userId: groupMembersMirror.userId })
		.from(groupMembersMirror)
		.where(eq(groupMembersMirror.groupId, groupId));
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
			messageId: voiceChannelMessageReactions.messageId,
			emoji: voiceChannelMessageReactions.emoji,
			userId: voiceChannelMessageReactions.userId,
			createdAt: voiceChannelMessageReactions.createdAt,
		})
		.from(voiceChannelMessageReactions)
		.where(inArray(voiceChannelMessageReactions.messageId, messageIds))
		.orderBy(voiceChannelMessageReactions.createdAt);
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

function serializeMessage(
	row: typeof voiceChannelMessages.$inferSelect,
	author: Awaited<ReturnType<typeof authorSummary>>,
	reactions: DmReactionSummary[],
) {
	return {
		id: row.id,
		channelId: row.channelId,
		groupId: row.groupId,
		authorId: row.authorId,
		content: row.content,
		attachments: row.attachments ?? [],
		isEdited: row.isEdited,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		pinnedAt: row.pinnedAt ? row.pinnedAt.toISOString() : null,
		pinnedBy: row.pinnedBy,
		replyToId: row.replyToId,
		replyToSnapshot: row.replyToSnapshot,
		forwardedFrom: row.forwardedFrom,
		author,
		reactions,
	};
}

// Voice-channel chat permissions are simpler than group chat: every group
// member can send, admins+ can pin or delete anyone's message. No per-channel
// overrides yet.
const isAdminOrOwner = (role: Role) => role === 'owner' || role === 'admin';

// ─── Send message ───────────────────────────────────────────────

messagesRoutes.post('/channels/:id/messages', async (c) => {
	const me = c.get('user');
	const channelId = c.req.param('id');

	const ch = await channelInfo(channelId);
	if (!ch) return c.json({ error: 'channel not found' }, 404);

	const role = await membership(ch.groupId, me.userId);
	if (!role) return c.json({ error: 'forbidden' }, 403);

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
		const [reply] = await db
			.select({
				authorId: voiceChannelMessages.authorId,
				content: voiceChannelMessages.content,
				attachments: voiceChannelMessages.attachments,
			})
			.from(voiceChannelMessages)
			.where(and(eq(voiceChannelMessages.id, replyToId), eq(voiceChannelMessages.channelId, channelId)))
			.limit(1);
		if (reply) {
			const authorName = (await authorSummary(reply.authorId)).username;
			const att = Array.isArray(reply.attachments) ? reply.attachments : [];
			replyToSnapshot = {
				authorId: reply.authorId,
				authorName,
				content: reply.content.slice(0, 200),
				attachmentType: att[0]?.mimeType ?? null,
			};
		}
	}

	const [msg] = await db.insert(voiceChannelMessages).values({
		channelId,
		groupId: ch.groupId,
		authorId: me.userId,
		content,
		attachments,
		replyToId,
		replyToSnapshot,
		forwardedFrom,
	}).returning();

	const hashes = extractAttachmentHashes(attachments);
	if (hashes.length > 0) {
		const token = bearerToken(c) ?? '';
		await addGroupGrants(hashes, ch.groupId, token);
		void removePendingGrants(hashes, me.userId, token);
	}

	const author = await authorSummary(me.userId);
	const memberIds = await listMemberIds(ch.groupId);
	const payload = serializeMessage(msg, author, []);

	void publishVoiceChannelMessage({
		targetUserIds: memberIds,
		channelId,
		groupId: ch.groupId,
		message: {
			id: payload.id,
			channelId: payload.channelId,
			groupId: payload.groupId,
			authorId: payload.authorId,
			content: payload.content,
			attachments: payload.attachments as any,
			isEdited: payload.isEdited,
			createdAt: payload.createdAt,
			replyToId: payload.replyToId,
			replyToSnapshot: payload.replyToSnapshot as any,
			forwardedFrom: payload.forwardedFrom as any,
			author: payload.author,
		},
	});

	return c.json({ message: payload }, 201);
});

// ─── Paginated message history ──────────────────────────────────

messagesRoutes.get('/channels/:id/messages', async (c) => {
	const me = c.get('user');
	const channelId = c.req.param('id');

	const ch = await channelInfo(channelId);
	if (!ch) return c.json({ error: 'channel not found' }, 404);

	const role = await membership(ch.groupId, me.userId);
	if (!role) return c.json({ error: 'forbidden' }, 403);

	const cursor = c.req.query('cursor');
	const after = c.req.query('after');
	const limit = Math.min(Number(c.req.query('limit')) || PAGE_LIMIT, 100);

	const baseConds = [eq(voiceChannelMessages.channelId, channelId)];
	if (cursor) baseConds.push(lt(voiceChannelMessages.createdAt, new Date(cursor)));
	if (after) baseConds.push(gt(voiceChannelMessages.createdAt, new Date(after)));

	const rows = await db
		.select()
		.from(voiceChannelMessages)
		.where(and(...baseConds))
		.orderBy(after ? asc(voiceChannelMessages.createdAt) : desc(voiceChannelMessages.createdAt))
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

	const [msg] = await db.select().from(voiceChannelMessages).where(eq(voiceChannelMessages.id, messageId)).limit(1);
	if (!msg) return c.json({ error: 'message not found' }, 404);
	if (msg.authorId !== me.userId) return c.json({ error: 'can only edit own messages' }, 403);

	const role = await membership(msg.groupId, me.userId);
	if (!role) return c.json({ error: 'not a member' }, 403);

	const body = await c.req.json().catch(() => ({}));
	const content = body?.content !== undefined ? String(body.content) : msg.content;
	const attachments = Array.isArray(body?.attachments) ? body.attachments : msg.attachments;

	const oldHashes = extractAttachmentHashes(msg.attachments);
	const newHashes = extractAttachmentHashes(attachments);

	const [updated] = await db.update(voiceChannelMessages)
		.set({ content, attachments, isEdited: true, updatedAt: new Date() })
		.where(eq(voiceChannelMessages.id, messageId))
		.returning();

	const token = bearerToken(c) ?? '';
	const added = newHashes.filter((h) => !oldHashes.includes(h));
	const removed = oldHashes.filter((h) => !newHashes.includes(h));
	if (added.length > 0) {
		await addGroupGrants(added, msg.groupId, token);
		void removePendingGrants(added, me.userId, token);
	}
	if (removed.length > 0) void removeGroupGrantsIfUnused(removed, msg.groupId, token);

	const memberIds = await listMemberIds(msg.groupId);
	void publishVoiceChannelMessageEdited({
		targetUserIds: memberIds,
		channelId: msg.channelId,
		groupId: msg.groupId,
		messageId,
		content,
		attachments: attachments as any,
		updatedAt: updated.updatedAt.toISOString(),
	});

	return c.json({ message: updated });
});

// ─── Delete message (own, or any if admin+) ─────────────────────

messagesRoutes.delete('/messages/:messageId', async (c) => {
	const me = c.get('user');
	const messageId = c.req.param('messageId');

	const [msg] = await db.select().from(voiceChannelMessages).where(eq(voiceChannelMessages.id, messageId)).limit(1);
	if (!msg) return c.json({ error: 'message not found' }, 404);

	const role = await membership(msg.groupId, me.userId);
	if (!role) return c.json({ error: 'not a member' }, 403);

	const isOwn = msg.authorId === me.userId;
	if (!isOwn && !isAdminOrOwner(role)) return c.json({ error: 'forbidden' }, 403);

	const removedHashes = extractAttachmentHashes(msg.attachments);
	await db.delete(voiceChannelMessages).where(eq(voiceChannelMessages.id, messageId));

	if (removedHashes.length > 0) {
		void removeGroupGrantsIfUnused(removedHashes, msg.groupId, bearerToken(c) ?? '');
	}

	const memberIds = await listMemberIds(msg.groupId);
	void publishVoiceChannelMessageDeleted({
		targetUserIds: memberIds,
		channelId: msg.channelId,
		groupId: msg.groupId,
		messageId,
	});

	return c.json({ success: true });
});

// ─── Mark channel as read ───────────────────────────────────────

messagesRoutes.post('/channels/:id/read', async (c) => {
	const me = c.get('user');
	const channelId = c.req.param('id');

	const ch = await channelInfo(channelId);
	if (!ch) return c.json({ error: 'channel not found' }, 404);

	const role = await membership(ch.groupId, me.userId);
	if (!role) return c.json({ error: 'not a member' }, 403);

	const now = new Date();
	await db.insert(voiceChannelChatReads).values({
		channelId, userId: me.userId, lastReadAt: now,
	}).onConflictDoUpdate({
		target: [voiceChannelChatReads.userId, voiceChannelChatReads.channelId],
		set: { lastReadAt: now },
	});

	const memberIds = await listMemberIds(ch.groupId);
	void publishVoiceChannelRead({
		targetUserIds: memberIds,
		channelId,
		groupId: ch.groupId,
		userId: me.userId,
		lastReadAt: now.toISOString(),
	});

	return c.json({ success: true });
});

// ─── Pinned messages ────────────────────────────────────────────

messagesRoutes.get('/channels/:id/pinned', async (c) => {
	const me = c.get('user');
	const channelId = c.req.param('id');

	const ch = await channelInfo(channelId);
	if (!ch) return c.json({ error: 'channel not found' }, 404);

	const role = await membership(ch.groupId, me.userId);
	if (!role) return c.json({ error: 'not a member' }, 403);

	const rows = await db
		.select()
		.from(voiceChannelMessages)
		.where(and(eq(voiceChannelMessages.channelId, channelId), isNotNull(voiceChannelMessages.pinnedAt)))
		.orderBy(desc(voiceChannelMessages.pinnedAt));

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

	const [msg] = await db.select().from(voiceChannelMessages).where(eq(voiceChannelMessages.id, messageId)).limit(1);
	if (!msg) return c.json({ error: 'message not found' }, 404);

	const role = await membership(msg.groupId, me.userId);
	if (!role) return c.json({ error: 'forbidden' }, 403);
	if (!isAdminOrOwner(role)) return c.json({ error: 'forbidden' }, 403);

	const now = new Date();
	await db.update(voiceChannelMessages)
		.set({ pinnedAt: now, pinnedBy: me.userId })
		.where(eq(voiceChannelMessages.id, messageId));

	const memberIds = await listMemberIds(msg.groupId);
	void publishVoiceChannelMessagePinned({
		targetUserIds: memberIds,
		channelId: msg.channelId,
		groupId: msg.groupId,
		messageId,
		pinnedAt: now.toISOString(),
		pinnedBy: me.userId,
	});

	return c.json({ success: true, pinnedAt: now.toISOString(), pinnedBy: me.userId });
});

messagesRoutes.delete('/messages/:messageId/pin', async (c) => {
	const me = c.get('user');
	const messageId = c.req.param('messageId');

	const [msg] = await db.select().from(voiceChannelMessages).where(eq(voiceChannelMessages.id, messageId)).limit(1);
	if (!msg) return c.json({ error: 'message not found' }, 404);

	const role = await membership(msg.groupId, me.userId);
	if (!role) return c.json({ error: 'forbidden' }, 403);
	if (!isAdminOrOwner(role)) return c.json({ error: 'forbidden' }, 403);

	await db.update(voiceChannelMessages)
		.set({ pinnedAt: null, pinnedBy: null })
		.where(eq(voiceChannelMessages.id, messageId));

	const memberIds = await listMemberIds(msg.groupId);
	void publishVoiceChannelMessageUnpinned({
		targetUserIds: memberIds,
		channelId: msg.channelId,
		groupId: msg.groupId,
		messageId,
	});

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
		.select({
			channelId: voiceChannelMessages.channelId,
			groupId: voiceChannelMessages.groupId,
			authorId: voiceChannelMessages.authorId,
		})
		.from(voiceChannelMessages).where(eq(voiceChannelMessages.id, messageId)).limit(1);
	if (!msg) return c.json({ error: 'message not found' }, 404);

	const role = await membership(msg.groupId, me.userId);
	if (!role) return c.json({ error: 'not a member' }, 403);

	// Toggle: remove if exists, replace if different emoji, add otherwise.
	// Enforce per-message unique-emoji cap.
	const [existing] = await db
		.select().from(voiceChannelMessageReactions)
		.where(and(eq(voiceChannelMessageReactions.messageId, messageId), eq(voiceChannelMessageReactions.userId, me.userId)))
		.limit(1);

	if (existing && existing.emoji === emoji) {
		await db.delete(voiceChannelMessageReactions).where(eq(voiceChannelMessageReactions.id, existing.id));
	} else if (existing) {
		await db.update(voiceChannelMessageReactions)
			.set({ emoji, createdAt: new Date() })
			.where(eq(voiceChannelMessageReactions.id, existing.id));
	} else {
		const [{ count: distinct }] = await db
			.select({ count: sql<number>`count(distinct ${voiceChannelMessageReactions.emoji})` })
			.from(voiceChannelMessageReactions)
			.where(eq(voiceChannelMessageReactions.messageId, messageId));
		const distinctEmojis = Number(distinct);
		const [{ exists }] = await db
			.select({ exists: sql<number>`count(*)` })
			.from(voiceChannelMessageReactions)
			.where(and(eq(voiceChannelMessageReactions.messageId, messageId), eq(voiceChannelMessageReactions.emoji, emoji)));
		if (Number(exists) === 0 && distinctEmojis >= MAX_UNIQUE_REACTIONS_PER_MESSAGE) {
			return c.json({ error: 'too many distinct reactions on this message' }, 409);
		}
		await db.insert(voiceChannelMessageReactions).values({
			messageId, userId: me.userId, emoji,
		});
	}

	const reactions = (await getReactionsForMessages([messageId]))[messageId] ?? [];
	const memberIds = await listMemberIds(msg.groupId);
	void publishVoiceChannelMessageReaction({
		targetUserIds: memberIds,
		channelId: msg.channelId,
		groupId: msg.groupId,
		messageId,
		messageAuthorId: msg.authorId,
		reactions,
	});

	return c.json({ reactions });
});
