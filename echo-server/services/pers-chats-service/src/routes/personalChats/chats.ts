/**
 * The chat list and the chats themselves. `/by-user/:userId` is registered
 * before any `/:chatId/...` route so a lookup by user id can never be read as
 * a chat id.
 */
import { Hono } from 'hono';
import {
	and,
	applyPhotoPrivacy,
	areFriends,
	checkMessagingPrivacy,
	count,
	db,
	decryptRow,
	desc,
	eq,
	findUserByUsername,
	gt,
	ilike,
	inArray,
	log,
	lt,
	max,
	ne,
	or,
	personalChatReads,
	personalChats,
	personalMessages,
	publishDmChatCreated,
	sql,
	userCache,
	type AuthEnv,
} from './shared.js';

export const routes = new Hono<AuthEnv>();

// List all personal chats for current user (paginated, ordered by last message date)
routes.get('/', async (c) => {
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
routes.get('/by-user/:userId', async (c) => {
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
routes.post('/', async (c) => {
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
