import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { or, eq, and, gt, count, ne, sql, inArray, lt, desc, max, ilike, isNotNull, isNull } from 'drizzle-orm';
import { authMiddleware, type AuthEnv } from '@echo/shared';
import { createDb } from '../db/index.js';
import { personalChats, personalMessages, personalChatReads, userCache, personalMessageLinks, personalMessageDeletions, personalMessageReactions } from '../db/schema.js';
import { config } from '../config.js';
import { publishDmEvent, publishDmReadEvent, publishDmEditedEvent, publishDmDeletedEvent, publishDmPinnedEvent, publishDmUnpinnedEvent, publishDmReactionEvent, publishDmChatCreated } from '../nats.js';
import type { DmReactionSummary } from '@echo/shared';
import { encryptForInsert, decryptRow, stripCiphertext, attachmentHashesFromRow } from '../crypto.js';
import { log } from '../log.js';

function extractAttachmentHashes(attachments: unknown): string[] {
	if (!Array.isArray(attachments)) return [];
	const hashes: string[] = [];
	for (const a of attachments) {
		const h = a && typeof a === 'object' && 'hash' in a ? (a as { hash?: string }).hash : null;
		if (h) hashes.push(h);
	}
	return hashes;
}

async function addChatGrants(hashes: string[], chatId: string, token: string): Promise<boolean> {
	if (hashes.length === 0) return true;
	try {
		const r = await fetch(`${config.blobServiceUrl}/blobs/grants`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
			body: JSON.stringify({ scopeType: 'chat', scopeId: chatId, hashes }),
		});
		if (!r.ok) {
			log.error({ status: r.status, chatId }, 'addChatGrants failed');
			return false;
		}
		return true;
	} catch (err) {
		log.error({ err }, 'addChatGrants threw');
		return false;
	}
}

// Used after /send to clean up the temporary pending(userId) grants the
// /upload flow created. Idempotent — pending grants only exist if the client
// uploaded via the bare /upload path with no chat context.
async function removePendingGrants(hashes: string[], userId: string, token: string): Promise<void> {
	if (hashes.length === 0) return;
	await fetch(`${config.blobServiceUrl}/blobs/grants`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ scopeType: 'pending', scopeId: userId, hashes }),
	}).catch(() => {});
}

// Remove the chat grant for each hash that no live message in this chat
// still references. The grant is per-(hash, chat), so if two messages share
// an attachment we must keep the grant until both are gone.
async function removeChatGrantsIfUnused(hashes: string[], chatId: string, token: string): Promise<void> {
	if (hashes.length === 0) return;

	const toRemove: string[] = [];
	for (const h of hashes) {
		const found = await db
			.select({ one: sql<number>`1` })
			.from(personalMessages)
			.where(
				and(
					eq(personalMessages.chatId, chatId),
					sql`COALESCE(${personalMessages.attachmentsMeta}, ${personalMessages.attachments}) @> ${JSON.stringify([{ hash: h }])}::jsonb`,
				),
			)
			.limit(1);
		if (found.length === 0) toRemove.push(h);
	}

	if (toRemove.length === 0) return;
	await fetch(`${config.blobServiceUrl}/blobs/grants`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ scopeType: 'chat', scopeId: chatId, hashes: toRemove }),
	}).catch(() => {});
}

const MAX_FILES_PER_MESSAGE = 5;
const MAX_UNIQUE_REACTIONS_PER_MESSAGE = 10;

const db = createDb(config.databaseUrl);

async function getReactionsForMessages(messageIds: string[]): Promise<Record<string, DmReactionSummary[]>> {
	const out: Record<string, DmReactionSummary[]> = {};
	if (messageIds.length === 0) return out;
	const rows = await db
		.select({
			messageId: personalMessageReactions.messageId,
			emoji: personalMessageReactions.emoji,
			userId: personalMessageReactions.userId,
			createdAt: personalMessageReactions.createdAt,
		})
		.from(personalMessageReactions)
		.where(inArray(personalMessageReactions.messageId, messageIds))
		.orderBy(personalMessageReactions.createdAt);
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

async function aggregateReactionsForMessage(messageId: string): Promise<DmReactionSummary[]> {
	const map = await getReactionsForMessages([messageId]);
	return map[messageId] ?? [];
}

const URL_REGEX = /https?:\/\/[^\s)>\]]+/g;

function extractUrls(content: string): string[] {
	return content.match(URL_REGEX) ?? [];
}

async function syncMessageLinks(messageId: string, chatId: string, content: string, createdAt: Date) {
	await db.delete(personalMessageLinks).where(eq(personalMessageLinks.messageId, messageId));
	const urls = extractUrls(content);
	if (urls.length > 0) {
		await db.insert(personalMessageLinks).values(
			urls.map((url) => ({ messageId, chatId, url, createdAt })),
		);
	}
}

async function areFriends(currentUserId: string, targetId: string, token: string): Promise<boolean> {
	try {
		const resp = await fetch(`${config.friendsServiceUrl}/friends/status/${targetId}`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (resp.ok) {
			const data = await resp.json() as { status: string };
			return data.status === 'friends';
		}
	} catch {}
	return false;
}

function applyPhotoPrivacy(
	user: { avatarUrl?: string | null; privacyPhoto?: string; [key: string]: unknown },
	viewerId: string,
	isFriend: boolean,
) {
	const { privacyPhoto, ...rest } = user;
	if (user.id === viewerId) return rest;
	if (privacyPhoto === 'nobody') rest.avatarUrl = null;
	else if (privacyPhoto === 'friends' && !isFriend) rest.avatarUrl = null;
	return rest;
}

/** Check if the target user's messaging privacy allows this sender to message them */
async function checkMessagingPrivacy(
	senderId: string, targetId: string, chatExists: boolean,
): Promise<{ allowed: boolean; reason?: string }> {
	const target = await db.query.userCache.findFirst({
		where: eq(userCache.id, targetId),
		columns: { privacyMessaging: true },
	});
	const privacyMessaging = target?.privacyMessaging ?? 'all';

	if (privacyMessaging === 'all') return { allowed: true };

	if (privacyMessaging === 'existing') {
		if (chatExists) return { allowed: true };
		return { allowed: false, reason: 'This user only accepts messages from existing chats' };
	}

	return { allowed: true };
}

export const personalChatsRoutes = new Hono<AuthEnv>();

personalChatsRoutes.use('*', authMiddleware(config.jwtSecret));

/** Look up a user by username — first check local cache, then HTTP fallback to user-service */
async function findUserByUsername(username: string) {
	const cached = await db.query.userCache.findFirst({
		where: eq(userCache.username, username),
		columns: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true },
	});
	if (cached) return cached;

	// HTTP fallback to user-service — this path only hits on cache miss
	// User-service requires auth, but this is an internal call so we skip for now
	// In a real setup, use service-to-service auth or an internal endpoint
	return null;
}

/** Count unread messages for a user in a chat */
async function getUnreadCount(userId: string, chatId: string): Promise<number> {
	const read = await db.query.personalChatReads.findFirst({
		where: and(
			eq(personalChatReads.userId, userId),
			eq(personalChatReads.chatId, chatId)
		),
	});

	if (!read) return 0;

	const [result] = await db
		.select({ count: count() })
		.from(personalMessages)
		.where(
			and(
				eq(personalMessages.chatId, chatId),
				ne(personalMessages.authorId, userId),
				gt(personalMessages.createdAt, read.lastReadAt)
			)
		);

	return result.count;
}

// Upload files — proxy to blob-service
personalChatsRoutes.post('/upload', async (c) => {
	const token = c.req.header('Authorization') ?? '';
	const resp = await fetch(`${config.blobServiceUrl}/blobs/upload`, {
		method: 'POST',
		headers: { Authorization: token },
		body: c.req.raw.body,
		// @ts-expect-error duplex needed for streaming body
		duplex: 'half',
	});
	const data = await resp.json() as { blobs?: unknown[]; error?: string };
	if (!resp.ok) return c.json(data, resp.status as any);
	return c.json({ attachments: data.blobs });
});

// Pre-upload dedup check — proxy to blob-service
personalChatsRoutes.post('/upload/check', async (c) => {
	const token = c.req.header('Authorization') ?? '';
	const body = await c.req.text();
	const resp = await fetch(`${config.blobServiceUrl}/blobs/check`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: token },
		body,
	});
	const data = await resp.json();
	return c.json(data, resp.status as any);
});

// List all personal chats for current user (paginated, ordered by last message date)
personalChatsRoutes.get('/', async (c) => {
	const currentUserId = c.get('user').userId;
	const cursor = c.req.query('cursor'); // ISO date string — fetch chats with last message before this
	const search = c.req.query('search')?.trim();
	const limit = Math.min(Number(c.req.query('limit')) || 20, 50);

	log.debug({ search, limit, cursor }, 'chat list query');

	// Get chat IDs ordered by last message date using a subquery
	const lastMsgDate = db
		.select({
			chatId: personalMessages.chatId,
			lastDate: max(personalMessages.createdAt).as('last_date'),
		})
		.from(personalMessages)
		.groupBy(personalMessages.chatId)
		.as('last_msg');

	// Determine the "other" user ID per chat, then join userCache once for search
	const otherUserId = sql`CASE
		WHEN ${personalChats.user1Id} = ${currentUserId} THEN ${personalChats.user2Id}
		ELSE ${personalChats.user1Id}
	END`;

	const searchConditions = search
		? [
			or(
				ilike(userCache.username, `%${search}%`),
				ilike(userCache.displayName, `%${search}%`),
			),
		]
		: [];

	let chatIdsQuery = db
		.select({
			chatId: personalChats.id,
			lastDate: sql<Date>`coalesce(${lastMsgDate.lastDate}, ${personalChats.createdAt})`.as('sort_date'),
		})
		.from(personalChats)
		.leftJoin(lastMsgDate, eq(lastMsgDate.chatId, personalChats.id))
		.innerJoin(userCache, eq(userCache.id, otherUserId))
		.where(
			and(
				or(
					eq(personalChats.user1Id, currentUserId),
					eq(personalChats.user2Id, currentUserId)
				),
				ne(personalChats.user1Id, personalChats.user2Id),
				...(cursor
					? [lt(sql`coalesce(${lastMsgDate.lastDate}, ${personalChats.createdAt})`, new Date(cursor))]
					: []
				),
				...searchConditions,
			)
		)
		.orderBy(desc(sql`coalesce(${lastMsgDate.lastDate}, ${personalChats.createdAt})`))
		.limit(limit + 1);

	const chatIdRows = await chatIdsQuery;
	const hasMore = chatIdRows.length > limit;
	if (hasMore) chatIdRows.pop();

	const chatIds = chatIdRows.map((r) => r.chatId);
	const sortDateMap = new Map(chatIdRows.map((r) => [r.chatId, r.lastDate]));

	if (chatIds.length === 0) {
		return c.json({ chats: [], hasMore: false, nextCursor: null });
	}

	// Fetch full chat data for this page
	const chats = await db.query.personalChats.findMany({
		where: inArray(personalChats.id, chatIds),
		with: {
			user1: {
				columns: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true, privacyOnlineStatus: true, privacyMessaging: true, privacyPhoto: true },
			},
			user2: {
				columns: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true, privacyOnlineStatus: true, privacyMessaging: true, privacyPhoto: true },
			},
			messages: {
				columns: {
					id: true,
					content: true,
					authorId: true,
					createdAt: true,
					readAt: true,
					attachments: true,
					replyToSnapshot: true,
					contentCiphertext: true,
					contentNonce: true,
					contentKeyId: true,
					attachmentsCiphertext: true,
					attachmentsNonce: true,
					attachmentsKeyId: true,
					replyToSnapshotCiphertext: true,
					replyToSnapshotNonce: true,
					replyToSnapshotKeyId: true,
					attachmentsMeta: true,
				},
				orderBy: (m, { desc }) => [desc(m.createdAt)],
				limit: 1,
			},
		},
	});

	// Sort in same order as chatIdRows
	const chatMap = new Map(chats.map((chat) => [chat.id, chat]));
	const sortedChats = chatIds.map((id) => chatMap.get(id)!).filter(Boolean);

	const allReads = await db.query.personalChatReads.findMany({
		where: inArray(personalChatReads.chatId, chatIds),
	});
	const myReadMap = new Map(
		allReads.filter((r) => r.userId === currentUserId).map((r) => [r.chatId, r.lastReadAt])
	);
	const otherReadMap = new Map(
		allReads.filter((r) => r.userId !== currentUserId).map((r) => [r.chatId, r.lastReadAt])
	);

	// Single aggregated query for unread counts
	const chatIdsWithReads = sortedChats
		.filter((chat) => myReadMap.has(chat.id))
		.map((chat) => chat.id);

	const unreadCounts = chatIdsWithReads.length > 0
		? await db
			.select({
				chatId: personalMessages.chatId,
				count: count(),
			})
			.from(personalMessages)
			.innerJoin(
				personalChatReads,
				and(
					eq(personalChatReads.chatId, personalMessages.chatId),
					eq(personalChatReads.userId, currentUserId),
					gt(personalMessages.createdAt, personalChatReads.lastReadAt),
				)
			)
			.where(
				and(
					inArray(personalMessages.chatId, chatIdsWithReads),
					ne(personalMessages.authorId, currentUserId),
				)
			)
			.groupBy(personalMessages.chatId)
		: [];

	const unreadMap = new Map(
		unreadCounts.map((r) => [r.chatId, r.count])
	);

	// Batch-check friendships for photo privacy
	const token = c.req.header('Authorization')?.slice(7) ?? '';
	const otherIds = sortedChats
		.map((chat) => chat.user1.id === currentUserId ? chat.user2 : chat.user1)
		.filter((u) => u.privacyPhoto === 'friends');
	const friendSet = new Set<string>();
	await Promise.all(
		otherIds.map(async (u) => {
			if (await areFriends(currentUserId, u.id, token)) friendSet.add(u.id);
		})
	);

	const result = sortedChats.map((chat) => {
		const other = chat.user1.id === currentUserId ? chat.user2 : chat.user1;
		const rawLastMsg = chat.messages[0] ?? null;
		const lastMsg = rawLastMsg ? decryptRow(rawLastMsg as any) : null;

		const mineAndLast = !!lastMsg && lastMsg.authorId === currentUserId;
		const lastMsgReadAt = mineAndLast && rawLastMsg?.readAt ? rawLastMsg.readAt : null;

		return {
			id: chat.id,
			user: applyPhotoPrivacy(other, currentUserId, friendSet.has(other.id)),
			lastMessage: lastMsg ? { content: lastMsg.content, authorId: lastMsg.authorId, createdAt: lastMsg.createdAt, attachments: (lastMsg.attachments as any[]) || [] } : null,
			unreadCount: unreadMap.get(chat.id) ?? 0,
			isLastMessageRead: mineAndLast ? lastMsgReadAt !== null : null,
			lastMessageReadAt: lastMsgReadAt ? lastMsgReadAt.toISOString() : null,
			createdAt: chat.createdAt,
		};
	});

	const lastSortDate = chatIdRows.length > 0
		? sortDateMap.get(chatIdRows[chatIdRows.length - 1].chatId)
		: null;

	return c.json({
		chats: result,
		hasMore,
		nextCursor: hasMore && lastSortDate ? new Date(lastSortDate).toISOString() : null,
	});
});

// Get a personal chat by companion user ID
personalChatsRoutes.get('/by-user/:userId', async (c) => {
	const currentUserId = c.get('user').userId;
	const targetUserId = c.req.param('userId');

	const chat = await db.query.personalChats.findFirst({
		where: or(
			and(eq(personalChats.user1Id, currentUserId), eq(personalChats.user2Id, targetUserId)),
			and(eq(personalChats.user1Id, targetUserId), eq(personalChats.user2Id, currentUserId))
		),
		with: {
			user1: {
				columns: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true, privacyOnlineStatus: true, privacyMessaging: true, privacyPhoto: true },
			},
			user2: {
				columns: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true, privacyOnlineStatus: true, privacyMessaging: true, privacyPhoto: true },
			},
		},
	});

	if (!chat) {
		const targetUser = await db.query.userCache.findFirst({
			where: eq(userCache.id, targetUserId),
			columns: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true, privacyOnlineStatus: true, privacyMessaging: true, privacyPhoto: true },
		});

		if (!targetUser) {
			return c.json({ chat: null });
		}

		const token = c.req.header('Authorization')?.slice(7) ?? '';
		const isFriend = targetUser.privacyPhoto === 'friends' ? await areFriends(currentUserId, targetUserId, token) : false;
		return c.json({
			chat: null,
			user: applyPhotoPrivacy(targetUser, currentUserId, isFriend),
		});
	}

	const other = chat.user1.id === currentUserId ? chat.user2 : chat.user1;
	const token = c.req.header('Authorization')?.slice(7) ?? '';
	const isFriend = other.privacyPhoto === 'friends' ? await areFriends(currentUserId, other.id, token) : false;

	return c.json({
		chat: {
			id: chat.id,
			user: applyPhotoPrivacy(other, currentUserId, isFriend),
			createdAt: chat.createdAt,
		},
	});
});

// Create a personal chat (or return existing)
personalChatsRoutes.post('/', async (c) => {
	const currentUserId = c.get('user').userId;
	const { username } = await c.req.json<{ username: string }>();

	if (!username) {
		return c.json({ error: 'username is required' }, 400);
	}

	const target = await findUserByUsername(username);

	if (!target) {
		return c.json({ error: 'User not found' }, 404);
	}

	const existing = await db.query.personalChats.findFirst({
		where: or(
			and(eq(personalChats.user1Id, currentUserId), eq(personalChats.user2Id, target.id)),
			and(eq(personalChats.user1Id, target.id), eq(personalChats.user2Id, currentUserId))
		),
	});

	if (existing) {
		return c.json({ chat: { id: existing.id, user: target, createdAt: existing.createdAt } });
	}

	// Check messaging privacy before creating a new chat
	const privacyCheck = await checkMessagingPrivacy(currentUserId, target.id, false);
	if (!privacyCheck.allowed) {
		return c.json({ error: privacyCheck.reason }, 403);
	}

	const [created] = await db.insert(personalChats).values({
		user1Id: currentUserId,
		user2Id: target.id,
	}).returning();

	await db.insert(personalChatReads).values([
		{ userId: currentUserId, chatId: created.id },
		{ userId: target.id, chatId: created.id },
	]);

	await publishDmChatCreated({ chatId: created.id, userIds: [currentUserId, target.id] });

	return c.json({ chat: { id: created.id, user: target, createdAt: created.createdAt } }, 201);
});

// Get messages for a personal chat
personalChatsRoutes.get('/:chatId/messages', async (c) => {
	const currentUserId = c.get('user').userId;
	const chatId = c.req.param('chatId');

	const chat = await db.query.personalChats.findFirst({
		where: and(
			eq(personalChats.id, chatId),
			or(
				eq(personalChats.user1Id, currentUserId),
				eq(personalChats.user2Id, currentUserId)
			)
		),
	});

	if (!chat) {
		return c.json({ error: 'Chat not found' }, 404);
	}

	const before = c.req.query('cursor') ?? c.req.query('before'); // ISO date — fetch messages before this
	const after = c.req.query('after'); // ISO date — fetch messages after this
	const around = c.req.query('around'); // message ID — fetch context around this message
	const limit = Math.min(Number(c.req.query('limit')) || 50, 100);

	let msgs: any[];
	let hasOlder = false;
	let hasNewer = false;

	if (around) {
		// Fetch messages around a specific message ID
		const target = await db.query.personalMessages.findFirst({
			where: and(eq(personalMessages.id, around), eq(personalMessages.chatId, chatId)),
		});
		if (!target) {
			return c.json({ error: 'Message not found' }, 404);
		}

		const half = Math.floor(limit / 2);

		const olderMsgs = await db.query.personalMessages.findMany({
			where: and(eq(personalMessages.chatId, chatId), ne(personalMessages.id, around), lt(personalMessages.createdAt, target.createdAt)),
			with: { author: { columns: { id: true, username: true, displayName: true, avatarUrl: true, privacyPhoto: true } } },
			orderBy: (m, { desc }) => [desc(m.createdAt)],
			limit: half + 1,
		});
		hasOlder = olderMsgs.length > half;
		if (hasOlder) olderMsgs.pop();
		olderMsgs.reverse();

		const newerMsgs = await db.query.personalMessages.findMany({
			where: and(eq(personalMessages.chatId, chatId), ne(personalMessages.id, around), gt(personalMessages.createdAt, target.createdAt)),
			with: { author: { columns: { id: true, username: true, displayName: true, avatarUrl: true, privacyPhoto: true } } },
			orderBy: (m, { asc }) => [asc(m.createdAt)],
			limit: half + 1,
		});
		hasNewer = newerMsgs.length > half;
		if (hasNewer) newerMsgs.pop();

		// Fetch the target message with author
		const targetWithAuthor = await db.query.personalMessages.findFirst({
			where: eq(personalMessages.id, around),
			with: { author: { columns: { id: true, username: true, displayName: true, avatarUrl: true, privacyPhoto: true } } },
		});

		msgs = [...olderMsgs, targetWithAuthor!, ...newerMsgs];
	} else if (after) {
		// Fetch messages after a cursor (for scrolling down / loading newer)
		msgs = await db.query.personalMessages.findMany({
			where: and(eq(personalMessages.chatId, chatId), gt(personalMessages.createdAt, new Date(after))),
			with: { author: { columns: { id: true, username: true, displayName: true, avatarUrl: true, privacyPhoto: true } } },
			orderBy: (m, { asc }) => [asc(m.createdAt)],
			limit: limit + 1,
		});
		hasNewer = msgs.length > limit;
		if (hasNewer) msgs.pop();
		hasOlder = true; // we came from somewhere, so there are older messages
	} else if (before) {
		// Fetch messages before a cursor (for scrolling up / loading older)
		msgs = await db.query.personalMessages.findMany({
			where: and(eq(personalMessages.chatId, chatId), lt(personalMessages.createdAt, new Date(before))),
			with: { author: { columns: { id: true, username: true, displayName: true, avatarUrl: true, privacyPhoto: true } } },
			orderBy: (m, { desc }) => [desc(m.createdAt)],
			limit: limit + 1,
		});
		hasOlder = msgs.length > limit;
		if (hasOlder) msgs.pop();
		msgs.reverse();
		hasNewer = true; // we used a before cursor, so there are newer messages
	} else {
		// No cursor — fetch latest messages
		msgs = await db.query.personalMessages.findMany({
			where: eq(personalMessages.chatId, chatId),
			with: { author: { columns: { id: true, username: true, displayName: true, avatarUrl: true, privacyPhoto: true } } },
			orderBy: (m, { desc }) => [desc(m.createdAt)],
			limit: limit + 1,
		});
		hasOlder = msgs.length > limit;
		if (hasOlder) msgs.pop();
		msgs.reverse();
		hasNewer = false; // we fetched the latest, nothing newer
	}

	msgs = msgs.map((m) => {
		const decrypted = decryptRow(m as any);
		const author = m.author;
		return { ...stripCiphertext(decrypted as any), author };
	});

	// Filter out messages soft-deleted by this user
	if (msgs.length > 0) {
		const deletedRows = await db.query.personalMessageDeletions.findMany({
			where: and(
				eq(personalMessageDeletions.userId, currentUserId),
				inArray(personalMessageDeletions.messageId, msgs.map(m => m.id)),
			),
			columns: { messageId: true },
		});
		if (deletedRows.length > 0) {
			const deletedSet = new Set(deletedRows.map(d => d.messageId));
			msgs = msgs.filter(m => !deletedSet.has(m.id));
		}
	}

	const otherId = chat.user1Id === currentUserId ? chat.user2Id : chat.user1Id;
	const otherRead = await db.query.personalChatReads.findFirst({
		where: and(
			eq(personalChatReads.userId, otherId),
			eq(personalChatReads.chatId, chatId)
		),
	});

	// Auto-mark as read on initial load (no cursor = opening the chat)
	if (!before && !after && !around) {
		const [updated] = await db
			.insert(personalChatReads)
			.values({ userId: currentUserId, chatId, lastReadAt: sql`now()` })
			.onConflictDoUpdate({
				target: [personalChatReads.userId, personalChatReads.chatId],
				set: { lastReadAt: sql`now()` },
			})
			.returning({ lastReadAt: personalChatReads.lastReadAt });

		await db.update(personalMessages)
			.set({ readAt: updated.lastReadAt })
			.where(and(
				eq(personalMessages.chatId, chatId),
				ne(personalMessages.authorId, currentUserId),
				isNull(personalMessages.readAt),
			));

		publishDmReadEvent({
			targetUserId: otherId,
			chatId,
			userId: currentUserId,
			lastReadAt: updated.lastReadAt.toISOString(),
		});
	}

	// Apply photo privacy to message authors
	const msgsToken = c.req.header('Authorization')?.slice(7) ?? '';
	const otherAuthorNeedsFriendCheck = msgs.some(
		(m) => m.author && m.author.id === otherId && m.author.privacyPhoto === 'friends',
	);
	const otherIsFriend = otherAuthorNeedsFriendCheck
		? await areFriends(currentUserId, otherId, msgsToken)
		: false;
	msgs = msgs.map((m) => ({
		...m,
		author: m.author ? applyPhotoPrivacy(m.author, currentUserId, otherIsFriend) : m.author,
	}));

	const reactionsMap = await getReactionsForMessages(msgs.map((m) => m.id));
	msgs = msgs.map((m) => ({ ...m, reactions: reactionsMap[m.id] ?? [] }));

	return c.json({
		messages: msgs,
		otherLastReadAt: otherRead?.lastReadAt?.toISOString() ?? null,
		hasMore: hasOlder, // backward compat
		hasOlder,
		hasNewer,
		nextCursor: hasOlder && msgs.length > 0 ? msgs[0].createdAt.toISOString() : null,
		newerCursor: hasNewer && msgs.length > 0 ? msgs[msgs.length - 1].createdAt.toISOString() : null,
	});
});

// Send a message in a personal chat
personalChatsRoutes.post('/:chatId/messages', async (c) => {
	const currentUserId = c.get('user').userId;
	const chatId = c.req.param('chatId');
	const { content, attachments: rawAttachments, replyToId } = await c.req.json<{ content: string; attachments?: unknown[]; replyToId?: string }>();

	const attachments = Array.isArray(rawAttachments) ? rawAttachments : [];

	if ((!content || !content.trim()) && attachments.length === 0) {
		return c.json({ error: 'Content or attachments required' }, 400);
	}

	if (content && content.length > 500) {
		return c.json({ error: 'Message too long' }, 400);
	}

	const chat = await db.query.personalChats.findFirst({
		where: and(
			eq(personalChats.id, chatId),
			or(
				eq(personalChats.user1Id, currentUserId),
				eq(personalChats.user2Id, currentUserId)
			)
		),
	});

	if (!chat) {
		return c.json({ error: 'Chat not found' }, 404);
	}

	const recipientId = chat.user1Id === currentUserId ? chat.user2Id : chat.user1Id;

	// Check messaging privacy (chat exists, so 'existing' is satisfied)
	const privacyCheck = await checkMessagingPrivacy(currentUserId, recipientId, true);
	if (!privacyCheck.allowed) {
		return c.json({ error: privacyCheck.reason }, 403);
	}

	// Build reply snapshot if replying
	let replyToSnapshot: { authorId: string; authorName: string; content: string; attachmentType?: string | null } | null = null;
	if (replyToId) {
		const originalRaw = await db.query.personalMessages.findFirst({
			where: and(eq(personalMessages.id, replyToId), eq(personalMessages.chatId, chatId)),
			with: { author: { columns: { id: true, username: true, displayName: true } } },
		});
		if (originalRaw) {
			const original = decryptRow(originalRaw as any);
			const originalAttachments = (original.attachments as any[]) || [];
			replyToSnapshot = {
				authorId: original.authorId,
				authorName: original.author.displayName || original.author.username,
				content: (original.content ?? '').slice(0, 200),
				attachmentType: originalAttachments.length > 0 ? originalAttachments[0].mimeType : null,
			};
		}
	}

	const trimmedContent = (content || '').trim();
	const messageId = randomUUID();
	const enc = encryptForInsert(messageId, {
		content: trimmedContent,
		attachments,
		replyToSnapshot,
	});

	const [msgRow] = await db.insert(personalMessages).values({
		id: messageId,
		chatId,
		authorId: currentUserId,
		content: '',
		attachments: [],
		replyToId: replyToSnapshot ? replyToId : null,
		replyToSnapshot: null,
		contentSearch: trimmedContent ? sql`to_tsvector('simple', ${trimmedContent})` as any : null,
		...enc,
	}).returning();

	const msg = {
		...stripCiphertext(msgRow as any),
		content: trimmedContent,
		attachments,
		replyToSnapshot,
	} as typeof msgRow & { content: string; attachments: unknown[]; replyToSnapshot: typeof replyToSnapshot };

	await syncMessageLinks(msg.id, chatId, msg.content, msg.createdAt);

	const author = await db.query.userCache.findFirst({
		where: eq(userCache.id, currentUserId),
		columns: { id: true, username: true, displayName: true, avatarUrl: true, privacyPhoto: true },
	});

	const sendToken = c.req.header('Authorization')?.slice(7) ?? '';
	const sendIsFriend = author?.privacyPhoto === 'friends'
		? await areFriends(currentUserId, recipientId, sendToken)
		: false;
	const authorForRecipient = applyPhotoPrivacy(author!, recipientId, sendIsFriend);
	const { privacyPhoto: _pp1, ...authorForSelf } = author!;

	const unreadCount = await getUnreadCount(recipientId, chatId);

	await publishDmEvent({
		targetUserId: recipientId,
		chatId,
		unreadCount,
		message: {
			id: msg.id,
			chatId: msg.chatId,
			authorId: msg.authorId,
			content: msg.content,
			attachments: msg.attachments as any[],
			isEdited: msg.isEdited,
			createdAt: msg.createdAt.toISOString(),
			replyToId: msg.replyToId,
			replyToSnapshot: msg.replyToSnapshot as any,
			author: authorForRecipient as any,
		},
	});

	return c.json({ message: { ...msg, author: authorForSelf } }, 201);
});

// Mark a personal chat as read
personalChatsRoutes.post('/:chatId/read', async (c) => {
	const currentUserId = c.get('user').userId;
	const chatId = c.req.param('chatId');

	const chat = await db.query.personalChats.findFirst({
		where: and(
			eq(personalChats.id, chatId),
			or(
				eq(personalChats.user1Id, currentUserId),
				eq(personalChats.user2Id, currentUserId)
			)
		),
	});

	if (!chat) {
		return c.json({ error: 'Chat not found' }, 404);
	}

	const [updated] = await db
		.insert(personalChatReads)
		.values({ userId: currentUserId, chatId, lastReadAt: sql`now()` })
		.onConflictDoUpdate({
			target: [personalChatReads.userId, personalChatReads.chatId],
			set: { lastReadAt: sql`now()` },
		})
		.returning({ lastReadAt: personalChatReads.lastReadAt });

	await db.update(personalMessages)
		.set({ readAt: updated.lastReadAt })
		.where(and(
			eq(personalMessages.chatId, chatId),
			ne(personalMessages.authorId, currentUserId),
			isNull(personalMessages.readAt),
		));

	const otherId = chat.user1Id === currentUserId ? chat.user2Id : chat.user1Id;

	await publishDmReadEvent({
		targetUserId: otherId,
		chatId,
		userId: currentUserId,
		lastReadAt: updated.lastReadAt.toISOString(),
	});

	return c.json({ success: true });
});

// Send a message by user ID (auto-creates chat if needed)
personalChatsRoutes.post('/send', async (c) => {
	const currentUserId = c.get('user').userId;
	const { userId, content, attachments: rawAttachments, replyToId, forwardedFrom: rawForwardedFrom } = await c.req.json<{ userId: string; content: string; attachments?: unknown[]; replyToId?: string; forwardedFrom?: { authorId: string; authorName: string; content: string; attachments?: unknown[] } | null }>();

	const attachments = Array.isArray(rawAttachments) ? rawAttachments : [];

	let forwardedFrom: { authorId: string; authorName: string; content: string; attachments: unknown[] } | null = null;
	if (rawForwardedFrom && typeof rawForwardedFrom === 'object'
		&& typeof rawForwardedFrom.authorId === 'string'
		&& typeof rawForwardedFrom.authorName === 'string'
		&& typeof rawForwardedFrom.content === 'string') {
		forwardedFrom = {
			authorId: rawForwardedFrom.authorId,
			authorName: rawForwardedFrom.authorName,
			content: rawForwardedFrom.content,
			attachments: Array.isArray(rawForwardedFrom.attachments) ? rawForwardedFrom.attachments : [],
		};
	}

	if (!userId || (!content?.trim() && attachments.length === 0 && !forwardedFrom)) {
		return c.json({ error: 'userId and content or attachments are required' }, 400);
	}

	if (content && content.length > 500) {
		return c.json({ error: 'Message too long' }, 400);
	}

	const targetId = userId;

	let chat = await db.query.personalChats.findFirst({
		where: or(
			and(eq(personalChats.user1Id, currentUserId), eq(personalChats.user2Id, targetId)),
			and(eq(personalChats.user1Id, targetId), eq(personalChats.user2Id, currentUserId))
		),
	});

	// Check messaging privacy
	const privacyCheck = await checkMessagingPrivacy(currentUserId, targetId, !!chat);
	if (!privacyCheck.allowed) {
		return c.json({ error: privacyCheck.reason }, 403);
	}

	if (!chat) {
		const [created] = await db.insert(personalChats).values({
			user1Id: currentUserId,
			user2Id: targetId,
		}).returning();
		chat = created;

		await db.insert(personalChatReads).values([
			{ userId: currentUserId, chatId: created.id },
			{ userId: targetId, chatId: created.id },
		]);

		await publishDmChatCreated({ chatId: created.id, userIds: [currentUserId, targetId] });
	}

	// Build reply snapshot if replying
	let replyToSnapshot: { authorId: string; authorName: string; content: string; attachmentType?: string | null } | null = null;
	if (replyToId) {
		const originalRaw = await db.query.personalMessages.findFirst({
			where: and(eq(personalMessages.id, replyToId), eq(personalMessages.chatId, chat.id)),
			with: { author: { columns: { id: true, username: true, displayName: true } } },
		});
		if (originalRaw) {
			const original = decryptRow(originalRaw as any);
			const originalAttachments = (original.attachments as any[]) || [];
			replyToSnapshot = {
				authorId: original.authorId,
				authorName: original.author.displayName || original.author.username,
				content: (original.content ?? '').slice(0, 200),
				attachmentType: originalAttachments.length > 0 ? originalAttachments[0].mimeType : null,
			};
		}
	}

	const trimmedContent = (content || '').trim();
	const messageId = randomUUID();
	const enc = encryptForInsert(messageId, {
		content: trimmedContent,
		attachments,
		replyToSnapshot,
	});

	const [msgRow] = await db.insert(personalMessages).values({
		id: messageId,
		chatId: chat.id,
		authorId: currentUserId,
		content: '',
		attachments: [],
		replyToId: replyToSnapshot ? replyToId : null,
		replyToSnapshot: null,
		forwardedFrom: forwardedFrom as any,
		contentSearch: trimmedContent ? sql`to_tsvector('simple', ${trimmedContent})` as any : null,
		...enc,
	}).returning();

	const msg = {
		...stripCiphertext(msgRow as any),
		content: trimmedContent,
		attachments,
		replyToSnapshot,
		forwardedFrom,
	} as typeof msgRow & { content: string; attachments: unknown[]; replyToSnapshot: typeof replyToSnapshot; forwardedFrom: typeof forwardedFrom };

	const sendMsgHashes = extractAttachmentHashes(msg.attachments);
	const sendAuthToken = c.req.header('Authorization')?.slice(7) ?? '';
	// Only strip the pending grant when the chat grant actually landed — otherwise
	// the blob has no remaining grants and gcIfOrphan deletes it, leaving a
	// dangling attachment reference that 404s forever.
	const granted = await addChatGrants(sendMsgHashes, chat.id, sendAuthToken);
	if (granted) {
		await removePendingGrants(sendMsgHashes, currentUserId, sendAuthToken);
	}

	await syncMessageLinks(msg.id, chat.id, msg.content, msg.createdAt);

	const author = await db.query.userCache.findFirst({
		where: eq(userCache.id, currentUserId),
		columns: { id: true, username: true, displayName: true, avatarUrl: true, privacyPhoto: true },
	});

	const sendToken = c.req.header('Authorization')?.slice(7) ?? '';
	const sendIsFriend = author?.privacyPhoto === 'friends'
		? await areFriends(currentUserId, targetId, sendToken)
		: false;
	const authorForRecipient = applyPhotoPrivacy(author!, targetId, sendIsFriend);
	const { privacyPhoto: _pp2, ...authorForSelf } = author!;

	const unreadCount = await getUnreadCount(targetId, chat.id);

	await publishDmEvent({
		targetUserId: targetId,
		chatId: chat.id,
		unreadCount,
		message: {
			id: msg.id,
			chatId: msg.chatId,
			authorId: msg.authorId,
			content: msg.content,
			attachments: msg.attachments as any[],
			isEdited: msg.isEdited,
			createdAt: msg.createdAt.toISOString(),
			replyToId: msg.replyToId,
			replyToSnapshot: msg.replyToSnapshot as any,
			forwardedFrom: forwardedFrom as any,
			author: authorForRecipient as any,
		},
	});

	return c.json({ message: { ...msg, author: authorForSelf }, chatId: chat.id }, 201);
});

// Forward messages to another user's chat
personalChatsRoutes.post('/forward', async (c) => {
	const currentUserId = c.get('user').userId;
	const { messageIds, targetUserId } = await c.req.json<{ messageIds: string[]; targetUserId: string }>();

	if (!Array.isArray(messageIds) || messageIds.length === 0 || !targetUserId) {
		return c.json({ error: 'messageIds and targetUserId are required' }, 400);
	}

	if (messageIds.length > 50) {
		return c.json({ error: 'Cannot forward more than 50 messages at once' }, 400);
	}

	// Fetch original messages with authors
	const originalsRaw = await db.query.personalMessages.findMany({
		where: inArray(personalMessages.id, messageIds),
		with: { author: { columns: { id: true, username: true, displayName: true } } },
		orderBy: (m, { asc }) => [asc(m.createdAt)],
	});
	const originals = originalsRaw.map((o) => {
		const dec = decryptRow(o as any);
		return { ...o, content: dec.content, attachments: dec.attachments } as typeof o;
	});

	if (originals.length === 0) {
		return c.json({ error: 'No messages found' }, 404);
	}

	// Verify current user has access to the source chats
	const sourceChatIds = [...new Set(originals.map(m => m.chatId))];
	for (const cid of sourceChatIds) {
		const chat = await db.query.personalChats.findFirst({
			where: and(
				eq(personalChats.id, cid),
				or(eq(personalChats.user1Id, currentUserId), eq(personalChats.user2Id, currentUserId)),
			),
		});
		if (!chat) return c.json({ error: 'Access denied to source chat' }, 403);
	}

	// Find or create target chat
	let targetChat = await db.query.personalChats.findFirst({
		where: or(
			and(eq(personalChats.user1Id, currentUserId), eq(personalChats.user2Id, targetUserId)),
			and(eq(personalChats.user1Id, targetUserId), eq(personalChats.user2Id, currentUserId))
		),
	});

	const privacyCheck = await checkMessagingPrivacy(currentUserId, targetUserId, !!targetChat);
	if (!privacyCheck.allowed) {
		return c.json({ error: privacyCheck.reason }, 403);
	}

	if (!targetChat) {
		const [created] = await db.insert(personalChats).values({
			user1Id: currentUserId,
			user2Id: targetUserId,
		}).returning();
		targetChat = created;

		await db.insert(personalChatReads).values([
			{ userId: currentUserId, chatId: created.id },
			{ userId: targetUserId, chatId: created.id },
		]);

		await publishDmChatCreated({ chatId: created.id, userIds: [currentUserId, targetUserId] });
	}

	const author = await db.query.userCache.findFirst({
		where: eq(userCache.id, currentUserId),
		columns: { id: true, username: true, displayName: true, avatarUrl: true, privacyPhoto: true },
	});

	const fwdToken = c.req.header('Authorization')?.slice(7) ?? '';
	const fwdIsFriend = author?.privacyPhoto === 'friends'
		? await areFriends(currentUserId, targetUserId, fwdToken)
		: false;
	const authorForRecipient = applyPhotoPrivacy(author!, targetUserId, fwdIsFriend);
	const { privacyPhoto: _pp3, ...authorForSelf } = author!;

	const created: Array<typeof originals[0] & { forwardedFrom: unknown }> = [];

	for (const orig of originals) {
		const origAttachments = Array.isArray(orig.attachments) ? (orig.attachments as unknown[]) : [];
		const forwardedFrom = {
			authorId: orig.authorId,
			authorName: orig.author.displayName || orig.author.username,
			content: orig.content,
			attachments: origAttachments,
		};

		const fwdMessageId = randomUUID();
		const fwdEnc = encryptForInsert(fwdMessageId, {
			content: orig.content ?? '',
			attachments: origAttachments,
			replyToSnapshot: null,
		});

		const [msgRow] = await db.insert(personalMessages).values({
			id: fwdMessageId,
			chatId: targetChat.id,
			authorId: currentUserId,
			content: '',
			attachments: [],
			forwardedFrom,
			contentSearch: orig.content ? sql`to_tsvector('simple', ${orig.content})` as any : null,
			...fwdEnc,
		}).returning();

		const msg = {
			...stripCiphertext(msgRow as any),
			content: orig.content ?? '',
			attachments: origAttachments,
		} as typeof msgRow & { content: string; attachments: unknown[] };

		const fwdHashes = attachmentHashesFromRow({ attachmentsMeta: fwdEnc.attachmentsMeta, attachments: origAttachments });
		await addChatGrants(fwdHashes, targetChat.id, fwdToken);

		await syncMessageLinks(msg.id, targetChat.id, msg.content, msg.createdAt);

		const unreadCount = await getUnreadCount(targetUserId, targetChat.id);

		const dmPayload = {
			targetUserId,
			chatId: targetChat.id,
			unreadCount,
			message: {
				id: msg.id,
				chatId: msg.chatId,
				authorId: msg.authorId,
				content: msg.content,
				attachments: msg.attachments as any[],
				isEdited: msg.isEdited,
				createdAt: msg.createdAt.toISOString(),
				replyToId: null,
				replyToSnapshot: null,
				forwardedFrom: forwardedFrom as any,
				author: authorForRecipient as any,
			},
		};
		log.debug({ forwardedFrom: dmPayload.message.forwardedFrom }, 'forward publish');
		await publishDmEvent(dmPayload);

		created.push({ ...msg, author: authorForSelf, forwardedFrom } as any);
	}

	return c.json({ messages: created, chatId: targetChat.id }, 201);
});

// Edit a message
personalChatsRoutes.patch('/messages/:messageId', async (c) => {
	const currentUserId = c.get('user').userId;
	const messageId = c.req.param('messageId');
	const { content, attachments: rawAttachments } = await c.req.json<{ content: string; attachments?: unknown[] }>();

	const newAttachments = Array.isArray(rawAttachments) ? rawAttachments : undefined;

	if ((!content || !content.trim()) && newAttachments !== undefined && newAttachments.length === 0) {
		return c.json({ error: 'Content or attachments required' }, 400);
	}

	if (content && content.length > 500) {
		return c.json({ error: 'Message too long' }, 400);
	}

	const msgRaw = await db.query.personalMessages.findFirst({
		where: eq(personalMessages.id, messageId),
	});

	if (!msgRaw) {
		return c.json({ error: 'Message not found' }, 404);
	}

	if (msgRaw.authorId !== currentUserId) {
		return c.json({ error: 'Not your message' }, 403);
	}

	const ageMs = Date.now() - new Date(msgRaw.createdAt).getTime();
	if (ageMs > 24 * 60 * 60 * 1000) {
		return c.json({ error: 'Can only edit messages from the last 24 hours' }, 403);
	}

	const msg = decryptRow(msgRaw as any);
	const trimmedContent = (content || '').trim();
	const effectiveAttachments = newAttachments !== undefined
		? newAttachments
		: (Array.isArray(msg.attachments) ? (msg.attachments as unknown[]) : []);

	const editEnc = encryptForInsert(messageId, {
		content: trimmedContent,
		attachments: effectiveAttachments,
		replyToSnapshot: msg.replyToSnapshot ?? null,
	});

	const updates: Record<string, unknown> = {
		content: '',
		isEdited: true,
		updatedAt: new Date(),
		contentCiphertext: editEnc.contentCiphertext,
		contentNonce: editEnc.contentNonce,
		contentKeyId: editEnc.contentKeyId,
		contentSearch: trimmedContent ? sql`to_tsvector('simple', ${trimmedContent})` : null,
	};
	if (newAttachments !== undefined) {
		updates.attachments = [];
		updates.attachmentsCiphertext = editEnc.attachmentsCiphertext;
		updates.attachmentsNonce = editEnc.attachmentsNonce;
		updates.attachmentsKeyId = editEnc.attachmentsKeyId;
		updates.attachmentsMeta = editEnc.attachmentsMeta;
	}

	const [updatedRow] = await db.update(personalMessages)
		.set(updates)
		.where(eq(personalMessages.id, messageId))
		.returning();

	const updated = {
		...stripCiphertext(updatedRow as any),
		content: trimmedContent,
		attachments: effectiveAttachments,
	} as typeof updatedRow & { content: string; attachments: unknown[] };

	// Reconcile chat grants against attachment diff. Added hashes get a chat
	// grant; removed hashes get GC'd if no other message in the chat refs them.
	if (newAttachments !== undefined) {
		const oldHashes = new Set(attachmentHashesFromRow(msgRaw as any));
		const newHashes = new Set(attachmentHashesFromRow({ attachmentsMeta: editEnc.attachmentsMeta, attachments: effectiveAttachments }));
		const added = [...newHashes].filter((h) => !oldHashes.has(h));
		const removed = [...oldHashes].filter((h) => !newHashes.has(h));
		const editToken = c.req.header('Authorization')?.slice(7) ?? '';
		const editGranted = await addChatGrants(added, msgRaw.chatId, editToken);
		if (editGranted) {
			await removePendingGrants(added, currentUserId, editToken);
		}
		await removeChatGrantsIfUnused(removed, msgRaw.chatId, editToken);
	}

	await syncMessageLinks(messageId, msgRaw.chatId, updated.content, msgRaw.createdAt);

	const chat = await db.query.personalChats.findFirst({
		where: eq(personalChats.id, msgRaw.chatId),
	});

	if (chat) {
		const recipientId = chat.user1Id === currentUserId ? chat.user2Id : chat.user1Id;
		await publishDmEditedEvent({
			targetUserId: recipientId,
			chatId: msgRaw.chatId,
			messageId,
			content: updated.content,
			attachments: updated.attachments as any[],
			updatedAt: updated.updatedAt.toISOString(),
		});
	}

	return c.json({ message: updated });
});

// Delete a message (mode: 'for_me' | 'for_everyone')
personalChatsRoutes.delete('/messages/:messageId', async (c) => {
	const currentUserId = c.get('user').userId;
	const messageId = c.req.param('messageId');
	const mode = c.req.query('mode') ?? 'for_everyone';

	const msg = await db.query.personalMessages.findFirst({
		where: eq(personalMessages.id, messageId),
	});

	if (!msg) {
		return c.json({ error: 'Message not found' }, 404);
	}

	const chat = await db.query.personalChats.findFirst({
		where: eq(personalChats.id, msg.chatId),
	});

	if (!chat || (chat.user1Id !== currentUserId && chat.user2Id !== currentUserId)) {
		return c.json({ error: 'Not your chat' }, 403);
	}

	if (mode === 'for_me') {
		await db.insert(personalMessageDeletions)
			.values({ messageId, userId: currentUserId })
			.onConflictDoNothing();
		return c.json({ success: true, mode: 'for_me' });
	}

	await db.delete(personalMessages).where(eq(personalMessages.id, messageId));
	const delToken = c.req.header('Authorization')?.slice(7) ?? '';
	await removeChatGrantsIfUnused(attachmentHashesFromRow(msg as any), msg.chatId, delToken);

	if (chat) {
		const recipientId = chat.user1Id === currentUserId ? chat.user2Id : chat.user1Id;
		if (msg.pinnedAt) {
			await publishDmUnpinnedEvent({
				targetUserId: recipientId,
				chatId: msg.chatId,
				messageId,
			});
		}
		await publishDmDeletedEvent({
			targetUserId: recipientId,
			chatId: msg.chatId,
			messageId,
		});
	}

	return c.json({ success: true, mode: 'for_everyone' });
});

// Batch delete messages (mode: 'for_me' | 'for_everyone')
personalChatsRoutes.post('/messages/batch-delete', async (c) => {
	const currentUserId = c.get('user').userId;
	const { messageIds, mode = 'for_everyone' } = await c.req.json<{ messageIds: string[]; mode?: string }>();

	if (!Array.isArray(messageIds) || messageIds.length === 0) {
		return c.json({ error: 'messageIds required' }, 400);
	}

	if (messageIds.length > 50) {
		return c.json({ error: 'Cannot delete more than 50 messages at once' }, 400);
	}

	const msgs = await db.query.personalMessages.findMany({
		where: inArray(personalMessages.id, messageIds),
	});

	if (mode === 'for_me') {
		if (msgs.length === 0) {
			return c.json({ error: 'No messages found' }, 404);
		}
		const chatIds = [...new Set(msgs.map(m => m.chatId))];
		const userChats = await db.query.personalChats.findMany({
			where: and(
				inArray(personalChats.id, chatIds),
				or(eq(personalChats.user1Id, currentUserId), eq(personalChats.user2Id, currentUserId)),
			),
		});
		const allowedChatIds = new Set(userChats.map(c => c.id));
		const validIds = msgs.filter(m => allowedChatIds.has(m.chatId)).map(m => m.id);
		if (validIds.length === 0) {
			return c.json({ error: 'No deletable messages found' }, 403);
		}
		await db.insert(personalMessageDeletions)
			.values(validIds.map(id => ({ messageId: id, userId: currentUserId })))
			.onConflictDoNothing();
		return c.json({ success: true, deleted: validIds, mode: 'for_me' });
	}

	// Verify user is a member of all chats containing these messages
	const chatIds = [...new Set(msgs.map(m => m.chatId))];
	const userChats = await db.query.personalChats.findMany({
		where: and(
			inArray(personalChats.id, chatIds),
			or(eq(personalChats.user1Id, currentUserId), eq(personalChats.user2Id, currentUserId)),
		),
	});
	const allowedChatIds = new Set(userChats.map(c => c.id));
	const deletable = msgs.filter(m => allowedChatIds.has(m.chatId));
	if (deletable.length === 0) {
		return c.json({ error: 'No deletable messages found' }, 403);
	}

	const deleteIds = deletable.map(m => m.id);
	await db.delete(personalMessages).where(inArray(personalMessages.id, deleteIds));
	const batchDelToken = c.req.header('Authorization')?.slice(7) ?? '';

	// Group hashes by chat so the unused-check runs per chat scope.
	const hashesByChat = new Map<string, Set<string>>();
	for (const m of deletable) {
		const set = hashesByChat.get(m.chatId) ?? new Set<string>();
		for (const h of attachmentHashesFromRow(m as any)) set.add(h);
		hashesByChat.set(m.chatId, set);
	}
	for (const [cid, hashSet] of hashesByChat) {
		await removeChatGrantsIfUnused([...hashSet], cid, batchDelToken);
	}

	// Group by chat for event publishing
	const byChatId = new Map<string, typeof deletable>();
	for (const m of deletable) {
		const arr = byChatId.get(m.chatId) ?? [];
		arr.push(m);
		byChatId.set(m.chatId, arr);
	}

	for (const [cid, chatMsgs] of byChatId) {
		const chatForEvents = userChats.find(c => c.id === cid);
		if (!chatForEvents) continue;
		const recipientId = chatForEvents.user1Id === currentUserId ? chatForEvents.user2Id : chatForEvents.user1Id;

		for (const m of chatMsgs) {
			if (m.pinnedAt) {
				await publishDmUnpinnedEvent({ targetUserId: recipientId, chatId: cid, messageId: m.id });
			}
			await publishDmDeletedEvent({ targetUserId: recipientId, chatId: cid, messageId: m.id });
		}
	}

	return c.json({ success: true, deleted: deleteIds, mode: 'for_everyone' });
});

const MAX_PINNED_PER_CHAT = 10;

// Get pinned messages for a chat
personalChatsRoutes.get('/:chatId/pinned', async (c) => {
	const currentUserId = c.get('user').userId;
	const chatId = c.req.param('chatId');

	const chat = await db.query.personalChats.findFirst({
		where: and(
			eq(personalChats.id, chatId),
			or(eq(personalChats.user1Id, currentUserId), eq(personalChats.user2Id, currentUserId)),
		),
	});
	if (!chat) return c.json({ error: 'Chat not found' }, 404);

	let pinned = await db.query.personalMessages.findMany({
		where: and(eq(personalMessages.chatId, chatId), isNotNull(personalMessages.pinnedAt)),
		with: { author: { columns: { id: true, username: true, displayName: true, avatarUrl: true, privacyPhoto: true } } },
		orderBy: (m, { desc }) => [desc(m.pinnedAt)],
		limit: MAX_PINNED_PER_CHAT,
	});
	pinned = pinned.map((m) => {
		const dec = decryptRow(m as any);
		const author = m.author;
		return { ...stripCiphertext(dec as any), author } as typeof m;
	});

	if (pinned.length > 0) {
		const deletedRows = await db.query.personalMessageDeletions.findMany({
			where: and(
				eq(personalMessageDeletions.userId, currentUserId),
				inArray(personalMessageDeletions.messageId, pinned.map(m => m.id)),
			),
			columns: { messageId: true },
		});
		if (deletedRows.length > 0) {
			const deletedSet = new Set(deletedRows.map(d => d.messageId));
			pinned = pinned.filter(m => !deletedSet.has(m.id));
		}
	}

	const otherId = chat.user1Id === currentUserId ? chat.user2Id : chat.user1Id;
	const pinnedToken = c.req.header('Authorization')?.slice(7) ?? '';
	const otherNeedsFriendCheck = pinned.some(
		(m) => m.author && m.author.id === otherId && m.author.privacyPhoto === 'friends',
	);
	const otherIsFriend = otherNeedsFriendCheck
		? await areFriends(currentUserId, otherId, pinnedToken)
		: false;
	let pinnedFiltered = pinned.map((m) => ({
		...m,
		author: m.author ? applyPhotoPrivacy(m.author, currentUserId, otherIsFriend) : m.author,
	}));

	const pinnedReactions = await getReactionsForMessages(pinnedFiltered.map((m) => m.id));
	pinnedFiltered = pinnedFiltered.map((m) => ({ ...m, reactions: pinnedReactions[m.id] ?? [] }));

	return c.json({ messages: pinnedFiltered });
});

// Get aggregate stats for a chat (messages count + attachment counts by kind)
// Search messages within a chat using the plaintext tsvector index.
// Returns most-recent matches first, paginated by createdAt.
personalChatsRoutes.get('/:chatId/search', async (c) => {
	const currentUserId = c.get('user').userId;
	const chatId = c.req.param('chatId');
	const q = (c.req.query('q') ?? '').trim();
	const cursor = c.req.query('cursor');
	const limit = Math.min(Number(c.req.query('limit')) || 30, 100);

	if (!q) return c.json({ messages: [], hasMore: false, nextCursor: null });

	const chat = await db.query.personalChats.findFirst({
		where: and(
			eq(personalChats.id, chatId),
			or(eq(personalChats.user1Id, currentUserId), eq(personalChats.user2Id, currentUserId)),
		),
	});
	if (!chat) return c.json({ error: 'Chat not found' }, 404);

	const deletedRows = await db.query.personalMessageDeletions.findMany({
		where: eq(personalMessageDeletions.userId, currentUserId),
		columns: { messageId: true },
	});
	const deletedSet = new Set(deletedRows.map((d) => d.messageId));

	const cursorDate = cursor ? new Date(cursor) : null;
	const conds = [
		eq(personalMessages.chatId, chatId),
		sql`${personalMessages.contentSearch} @@ plainto_tsquery('simple', ${q})`,
	];
	if (cursorDate) conds.push(lt(personalMessages.createdAt, cursorDate));

	const rowsRaw = await db.query.personalMessages.findMany({
		where: and(...conds),
		orderBy: (m, { desc }) => [desc(m.createdAt)],
		limit: limit + 1,
		with: {
			author: {
				columns: { id: true, username: true, displayName: true, avatarUrl: true },
			},
		},
	});

	const hasMore = rowsRaw.length > limit;
	const page = hasMore ? rowsRaw.slice(0, limit) : rowsRaw;
	const visible = page.filter((r) => !deletedSet.has(r.id));
	const searchReactions = await getReactionsForMessages(visible.map((r) => r.id));
	const messages = visible.map((r) => {
		const decrypted = decryptRow(r as any);
		return {
			id: r.id,
			chatId: r.chatId,
			authorId: r.authorId,
			content: decrypted.content,
			attachments: decrypted.attachments,
			createdAt: r.createdAt,
			author: r.author,
			reactions: searchReactions[r.id] ?? [],
		};
	});

	return c.json({
		messages,
		hasMore,
		nextCursor: hasMore && page.length > 0 ? page[page.length - 1].createdAt.toISOString() : null,
	});
});

personalChatsRoutes.get('/:chatId/stats', async (c) => {
	const currentUserId = c.get('user').userId;
	const chatId = c.req.param('chatId');

	const chat = await db.query.personalChats.findFirst({
		where: and(
			eq(personalChats.id, chatId),
			or(eq(personalChats.user1Id, currentUserId), eq(personalChats.user2Id, currentUserId)),
		),
	});
	if (!chat) return c.json({ error: 'Chat not found' }, 404);

	// `files` deliberately excludes audio: audio attachments are their own
	// category now (played inline rather than downloaded), so counting them in
	// both buckets would double up.
	const result = await db.execute(sql`
		SELECT
			(SELECT COUNT(*)::int FROM personal_messages WHERE chat_id = ${chatId}) AS messages,
			(SELECT COUNT(*)::int FROM personal_message_links WHERE chat_id = ${chatId}) AS links,
			COALESCE(SUM(CASE WHEN att->>'mimeType' LIKE 'image/%' AND att->>'mimeType' <> 'image/gif' THEN 1 ELSE 0 END), 0)::int AS photos,
			COALESCE(SUM(CASE WHEN att->>'mimeType' = 'image/gif' THEN 1 ELSE 0 END), 0)::int AS gifs,
			COALESCE(SUM(CASE WHEN att->>'mimeType' LIKE 'video/%' THEN 1 ELSE 0 END), 0)::int AS videos,
			COALESCE(SUM(CASE WHEN att->>'mimeType' LIKE 'audio/%' THEN 1 ELSE 0 END), 0)::int AS audio_total,
			COALESCE(SUM(CASE WHEN att->>'mimeType' NOT LIKE 'image/%' AND att->>'mimeType' NOT LIKE 'video/%' AND att->>'mimeType' NOT LIKE 'audio/%' THEN 1 ELSE 0 END), 0)::int AS files
		FROM personal_messages pm
		LEFT JOIN LATERAL jsonb_array_elements(COALESCE(pm.attachments_meta, pm.attachments)) att ON TRUE
		WHERE pm.chat_id = ${chatId}
	`);

	const row = (result as unknown as Array<{
		messages: number;
		links: number;
		photos: number;
		videos: number;
		files: number;
		gifs: number;
		audio_total: number;
	}>)[0];

	// Recorded voice notes and uploaded audio share the audio/* mime range and
	// are told apart by the attachment's `voice` payload — which lives inside
	// the ciphertext, not in attachments_meta. Decrypt just the messages that
	// carry audio (a small slice of any chat) and split the total there.
	const audioTotal = row?.audio_total ?? 0;
	let voiceMessages = 0;
	if (audioTotal > 0) {
		const audioMsgRows = await db.query.personalMessages.findMany({
			where: and(
				eq(personalMessages.chatId, chatId),
				sql`EXISTS (
					SELECT 1 FROM jsonb_array_elements(COALESCE(${personalMessages.attachmentsMeta}, ${personalMessages.attachments})) a
					WHERE a->>'mimeType' LIKE 'audio/%'
				)`,
			),
			columns: {
				id: true,
				content: true,
				attachments: true,
				replyToSnapshot: true,
				contentCiphertext: true,
				contentNonce: true,
				contentKeyId: true,
				attachmentsCiphertext: true,
				attachmentsNonce: true,
				attachmentsKeyId: true,
				replyToSnapshotCiphertext: true,
				replyToSnapshotNonce: true,
				replyToSnapshotKeyId: true,
			},
		});

		for (const m of audioMsgRows) {
			const dec = decryptRow(m as any);
			const list = Array.isArray(dec.attachments) ? (dec.attachments as Record<string, unknown>[]) : [];
			for (const a of list) {
				const mime = typeof a?.mimeType === 'string' ? a.mimeType : '';
				if (mime.startsWith('audio/') && a?.voice) voiceMessages++;
			}
		}
	}

	return c.json({
		messages: row?.messages ?? 0,
		links: row?.links ?? 0,
		photos: row?.photos ?? 0,
		videos: row?.videos ?? 0,
		files: row?.files ?? 0,
		gifs: row?.gifs ?? 0,
		audio: Math.max(0, audioTotal - voiceMessages),
		voiceMessages,
	});
});

// Paginated media listing for a chat. `kind` selects which attachment family
// to return; pagination uses a (createdAt, ord) cursor so we can stably page
// through individual attachments inside a message's JSON array.
personalChatsRoutes.get('/:chatId/media', async (c) => {
	const currentUserId = c.get('user').userId;
	const chatId = c.req.param('chatId');
	const kind = c.req.query('kind') ?? 'photos';
	const cursor = c.req.query('cursor');
	const limit = Math.min(Number(c.req.query('limit')) || 30, 100);

	if (
		kind !== 'photos' && kind !== 'videos' && kind !== 'gifs' &&
		kind !== 'audio' && kind !== 'files' && kind !== 'links'
	) {
		return c.json({ error: 'Invalid kind' }, 400);
	}

	const chat = await db.query.personalChats.findFirst({
		where: and(
			eq(personalChats.id, chatId),
			or(eq(personalChats.user1Id, currentUserId), eq(personalChats.user2Id, currentUserId)),
		),
	});
	if (!chat) return c.json({ error: 'Chat not found' }, 404);

	// ── Links branch — reads from the dedicated links table ──
	if (kind === 'links') {
		let cursorId: number | null = null;
		if (cursor) cursorId = Number(cursor) || null;

		const cursorFilter = cursorId !== null
			? sql`AND l.id < ${cursorId}`
			: sql.empty();

		let linkResult;
		try {
			linkResult = await db.execute(sql`
				SELECT l.id, l.message_id, l.url, l.created_at
				FROM personal_message_links l
				WHERE l.chat_id = ${chatId}
					${cursorFilter}
				ORDER BY l.created_at DESC, l.id DESC
				LIMIT ${limit + 1}
			`);
		} catch (err) {
			log.error({ err }, 'links query failed');
			return c.json({ error: 'Failed to load links' }, 500);
		}

		const linkRows = linkResult as unknown as Array<{
			id: number;
			message_id: string;
			url: string;
			created_at: Date | string;
		}>;

		const hasMore = linkRows.length > limit;
		if (hasMore) linkRows.pop();

		const tsToStr = (t: Date | string): string =>
			t instanceof Date ? t.toISOString() : t;

		const items = linkRows.map((r) => ({
			messageId: r.message_id,
			createdAt: tsToStr(r.created_at),
			url: r.url,
		}));

		const last = linkRows[linkRows.length - 1];
		const nextCursor = hasMore && last ? String(last.id) : null;

		return c.json({ items, hasMore, nextCursor });
	}

	// ── Attachment-based kinds ──
	// `files` is documents only — audio has its own kind, matching how the stats
	// endpoint buckets them and how the chat renders them.
	const mimeFilter = kind === 'photos'
		? sql`att.value->>'mimeType' LIKE 'image/%' AND att.value->>'mimeType' <> 'image/gif'`
		: kind === 'gifs'
			? sql`att.value->>'mimeType' = 'image/gif'`
			: kind === 'videos'
				? sql`att.value->>'mimeType' LIKE 'video/%'`
				: kind === 'audio'
					? sql`att.value->>'mimeType' LIKE 'audio/%'`
					: sql`att.value->>'mimeType' NOT LIKE 'image/%' AND att.value->>'mimeType' NOT LIKE 'video/%' AND att.value->>'mimeType' NOT LIKE 'audio/%'`;

	// Cursor format: `${pgTimestampString}|${ord}`. We deliberately keep the
	// timestamp as a raw string and cast it with ::timestamp on the SQL side —
	// round-tripping through JS Date loses microseconds and is ambiguous for
	// Postgres "timestamp without time zone" values.
	let cursorTimestamp: string | null = null;
	let cursorOrd: number | null = null;
	if (cursor) {
		const sep = cursor.lastIndexOf('|');
		if (sep > 0) {
			const tsPart = cursor.slice(0, sep).trim();
			const ord = Number(cursor.slice(sep + 1));
			if (tsPart && Number.isFinite(ord)) {
				cursorTimestamp = tsPart;
				cursorOrd = ord;
			}
		}
	}

	const cursorFilter = cursorTimestamp !== null && cursorOrd !== null
		? sql`AND (pm.created_at < ${cursorTimestamp}::timestamp OR (pm.created_at = ${cursorTimestamp}::timestamp AND att.ord > ${cursorOrd}))`
		: sql.empty();

	let result;
	try {
		result = await db.execute(sql`
			SELECT
				pm.id AS message_id,
				pm.created_at AS created_at,
				att.ord AS ord,
				att.value AS attachment
			FROM personal_messages pm
			CROSS JOIN LATERAL jsonb_array_elements(COALESCE(pm.attachments_meta, pm.attachments)) WITH ORDINALITY att(value, ord)
			WHERE pm.chat_id = ${chatId}
				AND (${mimeFilter})
				${cursorFilter}
			ORDER BY pm.created_at DESC, att.ord ASC
			LIMIT ${limit + 1}
		`);
	} catch (err) {
		log.error({ err }, 'media query failed');
		return c.json({ error: 'Failed to load media' }, 500);
	}

	// `att.value` is whatever COALESCE picked. For encrypted rows that is the
	// attachments_meta projection — hash/mimeType/size only, enough to filter
	// and paginate on but not to render: url, filename and id live inside the
	// ciphertext. Legacy plaintext rows already carry the full attachment.
	const rows = result as unknown as Array<{
		message_id: string;
		created_at: Date | string;
		ord: number | bigint | string;
		attachment: Record<string, unknown>;
	}>;

	const hasMore = rows.length > limit;
	if (hasMore) rows.pop();

	const tsToString = (t: Date | string): string =>
		t instanceof Date ? t.toISOString() : t;

	// Decrypt once per message, then resolve each row's attachment out of the
	// plaintext array. Matched by hash rather than by ordinal: metaFromAttachments
	// drops entries without one, so the two arrays are not guaranteed to line up.
	const messageIds = [...new Set(rows.map((r) => r.message_id))];
	const decryptedByMessage = new Map<string, Record<string, unknown>[]>();
	const metaByMessage = new Map<string, Record<string, unknown>[]>();
	if (messageIds.length > 0) {
		const msgRows = await db.query.personalMessages.findMany({
			where: inArray(personalMessages.id, messageIds),
			columns: {
				id: true,
				content: true,
				attachments: true,
				attachmentsMeta: true,
				replyToSnapshot: true,
				contentCiphertext: true,
				contentNonce: true,
				contentKeyId: true,
				attachmentsCiphertext: true,
				attachmentsNonce: true,
				attachmentsKeyId: true,
				replyToSnapshotCiphertext: true,
				replyToSnapshotNonce: true,
				replyToSnapshotKeyId: true,
			},
		});
		for (const m of msgRows) {
			const dec = decryptRow(m as any);
			decryptedByMessage.set(
				m.id,
				Array.isArray(dec.attachments) ? (dec.attachments as Record<string, unknown>[]) : [],
			);
			metaByMessage.set(
				m.id,
				Array.isArray(m.attachmentsMeta) ? (m.attachmentsMeta as Record<string, unknown>[]) : [],
			);
		}
	}

	const items = rows
		.map((r) => {
			const meta = r.attachment ?? {};
			// Already a full attachment (legacy plaintext row) — nothing to resolve.
			let attachment: Record<string, unknown> | undefined =
				typeof meta.url === 'string' ? meta : undefined;

			if (!attachment) {
				const list = decryptedByMessage.get(r.message_id) ?? [];
				if (typeof meta.hash === 'string') {
					// A message can carry the same file twice, and both meta entries
					// then share a hash. Matching on the hash alone hands every copy
					// the *first* plaintext entry, so the page comes back with the
					// same attachment id repeated. Pair the Nth meta entry with the
					// Nth plaintext entry of that hash instead. Ranking off the full
					// meta array (rather than the rows in this page) keeps the answer
					// stable when a message straddles a page boundary.
					const metaList = metaByMessage.get(r.message_id) ?? [];
					const ordIdx = Number(r.ord) - 1;
					let rank = 0;
					for (let i = 0; i < ordIdx && i < metaList.length; i++) {
						if (metaList[i]?.hash === meta.hash) rank++;
					}
					let seen = 0;
					attachment = list.find((a) => a?.hash === meta.hash && seen++ === rank);
				} else {
					attachment = list[Number(r.ord) - 1];
				}
			}
			if (!attachment) return null;
			// The audio tab lists uploads only — recorded voice notes are counted
			// and surfaced separately. The `voice` flag is only visible once the
			// attachment has been decrypted, so this filter has to run here rather
			// than in the SQL predicate; a page may come back short as a result and
			// the caller simply pages again.
			if (kind === 'audio' && attachment.voice) return null;

			return {
				messageId: r.message_id,
				createdAt: tsToString(r.created_at),
				attachment,
			};
		})
		.filter((it): it is NonNullable<typeof it> => it !== null);

	const last = rows[rows.length - 1];
	const nextCursor = hasMore && last
		? `${tsToString(last.created_at)}|${Number(last.ord)}`
		: null;

	return c.json({ items, hasMore, nextCursor });
});

// Pin a message
personalChatsRoutes.post('/messages/:messageId/pin', async (c) => {
	const currentUserId = c.get('user').userId;
	const messageId = c.req.param('messageId');

	const msg = await db.query.personalMessages.findFirst({
		where: eq(personalMessages.id, messageId),
	});
	if (!msg) return c.json({ error: 'Message not found' }, 404);

	const chat = await db.query.personalChats.findFirst({
		where: and(
			eq(personalChats.id, msg.chatId),
			or(eq(personalChats.user1Id, currentUserId), eq(personalChats.user2Id, currentUserId)),
		),
	});
	if (!chat) return c.json({ error: 'Chat not found' }, 404);

	if (msg.pinnedAt) {
		return c.json({ error: 'Message already pinned' }, 400);
	}

	const [{ value: pinnedCount }] = await db
		.select({ value: count() })
		.from(personalMessages)
		.where(and(eq(personalMessages.chatId, msg.chatId), isNotNull(personalMessages.pinnedAt)));

	if (pinnedCount >= MAX_PINNED_PER_CHAT) {
		return c.json({ error: `Maximum ${MAX_PINNED_PER_CHAT} pinned messages per chat` }, 400);
	}

	const pinnedAt = new Date();
	await db.update(personalMessages)
		.set({ pinnedAt, pinnedBy: currentUserId })
		.where(eq(personalMessages.id, messageId));

	const recipientId = chat.user1Id === currentUserId ? chat.user2Id : chat.user1Id;
	await publishDmPinnedEvent({
		targetUserId: recipientId,
		chatId: msg.chatId,
		messageId,
		pinnedAt: pinnedAt.toISOString(),
		pinnedBy: currentUserId,
	});

	return c.json({ success: true, pinnedAt: pinnedAt.toISOString(), pinnedBy: currentUserId });
});

// Unpin a message
personalChatsRoutes.delete('/messages/:messageId/pin', async (c) => {
	const currentUserId = c.get('user').userId;
	const messageId = c.req.param('messageId');

	const msg = await db.query.personalMessages.findFirst({
		where: eq(personalMessages.id, messageId),
	});
	if (!msg) return c.json({ error: 'Message not found' }, 404);

	const chat = await db.query.personalChats.findFirst({
		where: and(
			eq(personalChats.id, msg.chatId),
			or(eq(personalChats.user1Id, currentUserId), eq(personalChats.user2Id, currentUserId)),
		),
	});
	if (!chat) return c.json({ error: 'Chat not found' }, 404);

	if (!msg.pinnedAt) {
		return c.json({ error: 'Message not pinned' }, 400);
	}

	await db.update(personalMessages)
		.set({ pinnedAt: null, pinnedBy: null })
		.where(eq(personalMessages.id, messageId));

	const recipientId = chat.user1Id === currentUserId ? chat.user2Id : chat.user1Id;
	await publishDmUnpinnedEvent({
		targetUserId: recipientId,
		chatId: msg.chatId,
		messageId,
	});

	return c.json({ success: true });
});

// Set (or swap) the current user's reaction on a message. Body: { emoji }.
// One reaction per (user, message) — any prior reaction is replaced.
personalChatsRoutes.put('/messages/:messageId/reaction', async (c) => {
	const currentUserId = c.get('user').userId;
	const messageId = c.req.param('messageId');

	const body = await c.req.json().catch(() => ({}));
	const emoji = typeof body?.emoji === 'string' ? body.emoji.trim() : '';
	if (!emoji || emoji.length > 32) {
		return c.json({ error: 'emoji is required' }, 400);
	}

	const msg = await db.query.personalMessages.findFirst({
		where: eq(personalMessages.id, messageId),
	});
	if (!msg) return c.json({ error: 'Message not found' }, 404);

	const chat = await db.query.personalChats.findFirst({
		where: and(
			eq(personalChats.id, msg.chatId),
			or(eq(personalChats.user1Id, currentUserId), eq(personalChats.user2Id, currentUserId)),
		),
	});
	if (!chat) return c.json({ error: 'Chat not found' }, 404);

	const existing = await db
		.selectDistinct({ emoji: personalMessageReactions.emoji })
		.from(personalMessageReactions)
		.where(eq(personalMessageReactions.messageId, messageId));
	const distinctEmojis = new Set(existing.map((r) => r.emoji));
	if (!distinctEmojis.has(emoji)) {
		const userCurrent = await db.query.personalMessageReactions.findFirst({
			where: and(
				eq(personalMessageReactions.messageId, messageId),
				eq(personalMessageReactions.userId, currentUserId),
			),
		});
		let effectiveCount = distinctEmojis.size;
		if (userCurrent) {
			const otherWithSame = await db.query.personalMessageReactions.findFirst({
				where: and(
					eq(personalMessageReactions.messageId, messageId),
					eq(personalMessageReactions.emoji, userCurrent.emoji),
					ne(personalMessageReactions.userId, currentUserId),
				),
			});
			if (!otherWithSame) effectiveCount -= 1;
		}
		if (effectiveCount + 1 > MAX_UNIQUE_REACTIONS_PER_MESSAGE) {
			return c.json({ error: `Maximum ${MAX_UNIQUE_REACTIONS_PER_MESSAGE} unique reactions per message` }, 400);
		}
	}

	await db.insert(personalMessageReactions)
		.values({ messageId, userId: currentUserId, emoji })
		.onConflictDoUpdate({
			target: [personalMessageReactions.userId, personalMessageReactions.messageId],
			set: { emoji, createdAt: sql`now()` },
		});

	const reactions = await aggregateReactionsForMessage(messageId);
	const recipientId = chat.user1Id === currentUserId ? chat.user2Id : chat.user1Id;
	await publishDmReactionEvent({
		targetUserId: recipientId,
		chatId: msg.chatId,
		messageId,
		messageAuthorId: msg.authorId,
		reactions,
	});

	return c.json({ reactions });
});

// Clear the current user's reaction on a message.
personalChatsRoutes.delete('/messages/:messageId/reaction', async (c) => {
	const currentUserId = c.get('user').userId;
	const messageId = c.req.param('messageId');

	const msg = await db.query.personalMessages.findFirst({
		where: eq(personalMessages.id, messageId),
	});
	if (!msg) return c.json({ error: 'Message not found' }, 404);

	const chat = await db.query.personalChats.findFirst({
		where: and(
			eq(personalChats.id, msg.chatId),
			or(eq(personalChats.user1Id, currentUserId), eq(personalChats.user2Id, currentUserId)),
		),
	});
	if (!chat) return c.json({ error: 'Chat not found' }, 404);

	await db.delete(personalMessageReactions).where(and(
		eq(personalMessageReactions.messageId, messageId),
		eq(personalMessageReactions.userId, currentUserId),
	));

	const reactions = await aggregateReactionsForMessage(messageId);
	const recipientId = chat.user1Id === currentUserId ? chat.user2Id : chat.user1Id;
	await publishDmReactionEvent({
		targetUserId: recipientId,
		chatId: msg.chatId,
		messageId,
		messageAuthorId: msg.authorId,
		reactions,
	});

	return c.json({ reactions });
});
