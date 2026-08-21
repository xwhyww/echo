/**
 * Adding and removing an emoji on a message.
 */
import { Hono } from 'hono';
import {
	MAX_UNIQUE_REACTIONS_PER_MESSAGE,
	aggregateReactionsForMessage,
	and,
	db,
	eq,
	ne,
	or,
	personalChats,
	personalMessageReactions,
	personalMessages,
	publishDmReactionEvent,
	sql,
	type AuthEnv,
} from './shared.js';

export const routes = new Hono<AuthEnv>();

// Set (or swap) the current user's reaction on a message. Body: { emoji }.
// One reaction per (user, message) — any prior reaction is replaced.
routes.put('/messages/:messageId/reaction', async (c) => {
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
routes.delete('/messages/:messageId/reaction', async (c) => {
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
