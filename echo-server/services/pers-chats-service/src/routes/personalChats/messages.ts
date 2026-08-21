/**
 * Sending, reading, editing and deleting. The bulk of the surface.
 */
import { Hono } from 'hono';
import {
	addChatGrants,
	and,
	applyPhotoPrivacy,
	areFriends,
	attachmentHashesFromRow,
	checkMessagingPrivacy,
	db,
	decryptRow,
	encryptForInsert,
	eq,
	extractAttachmentHashes,
	getReactionsForMessages,
	getUnreadCount,
	gt,
	inArray,
	isNull,
	log,
	lt,
	ne,
	or,
	personalChatReads,
	personalChats,
	personalMessageDeletions,
	personalMessages,
	publishDmChatCreated,
	publishDmDeletedEvent,
	publishDmEditedEvent,
	publishDmEvent,
	publishDmReadEvent,
	publishDmUnpinnedEvent,
	randomUUID,
	removeChatGrantsIfUnused,
	removePendingGrants,
	sql,
	stripCiphertext,
	syncMessageLinks,
	userCache,
	type AuthEnv,
} from './shared.js';

export const routes = new Hono<AuthEnv>();

// Get messages for a personal chat
routes.get('/:chatId/messages', async (c) => {
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
routes.post('/:chatId/messages', async (c) => {
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
routes.post('/:chatId/read', async (c) => {
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
routes.post('/send', async (c) => {
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
routes.post('/forward', async (c) => {
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
routes.patch('/messages/:messageId', async (c) => {
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
routes.delete('/messages/:messageId', async (c) => {
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
routes.post('/messages/batch-delete', async (c) => {
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
