/**
 * Pinned messages. `MAX_PINNED_PER_CHAT` lives here rather than in shared.ts
 * because nothing else asks about it.
 */
import { Hono } from 'hono';
import {
	and,
	applyPhotoPrivacy,
	areFriends,
	count,
	db,
	decryptRow,
	eq,
	getReactionsForMessages,
	inArray,
	isNotNull,
	or,
	personalChats,
	personalMessageDeletions,
	personalMessages,
	publishDmPinnedEvent,
	publishDmUnpinnedEvent,
	stripCiphertext,
	type AuthEnv,
} from './shared.js';

export const routes = new Hono<AuthEnv>();

const MAX_PINNED_PER_CHAT = 10;

// Get pinned messages for a chat
routes.get('/:chatId/pinned', async (c) => {
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

// Pin a message
routes.post('/messages/:messageId/pin', async (c) => {
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
routes.delete('/messages/:messageId/pin', async (c) => {
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
