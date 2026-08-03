import { groupsService } from '$lib/api/groupsService.js';
import { groupsStore } from '$lib/stores/groups.svelte.js';
import { personalChatsService } from '$lib/api/personalChatsService.js';
import { personalChatsStore } from '$lib/stores/personalChats.svelte.js';
import { groupChatPanelCaches } from '$lib/hooks/chat/useGroupChatCache.svelte.js';
import { invalidateChatCache } from '$lib/utils/personalChatCache.js';
import type { GroupAttachment } from '$lib/api/groups.js';
import type { Attachment, PersonalMessage } from '$lib/api/personalChats.js';
import type { PersonalChatUser } from '$lib/api/personalChats.js';

/** The shape both chat surfaces agree on for a message being forwarded. */
export interface ForwardableMessage {
	id: string;
	content: string;
	authorId: string;
	author: { displayName: string | null; username: string };
	attachments: unknown[];
	createdAt: string;
}

function oldestFirst<T extends { createdAt: string }>(messages: T[]): T[] {
	return [...messages].sort(
		(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
	);
}

/**
 * Re-sends the given messages into a group, oldest first, each carrying its
 * original author as `forwardedFrom`.
 *
 * Sequential on purpose: the server orders by arrival, so firing these in
 * parallel would scramble a forwarded conversation.
 */
export async function forwardMessagesToGroup(
	groupId: string,
	messages: ForwardableMessage[],
): Promise<void> {
	const ordered = oldestFirst(messages);

	let last: Awaited<ReturnType<typeof groupsService.sendMessage>>['message'] | null = null;
	for (const msg of ordered) {
		const attachments = msg.attachments as unknown as GroupAttachment[];
		const res = await groupsService.sendMessage(groupId, msg.content, attachments, undefined, {
			authorId: msg.authorId,
			authorName: msg.author.displayName ?? msg.author.username,
			content: msg.content,
			attachments,
		});
		last = res.message;
	}

	if (last) groupsStore.updateLastMessage(groupId, last, false);

	// Drop the destination's cached messages so opening that group refetches and
	// shows what we just forwarded. Its header cache (group + members) is
	// unaffected.
	groupChatPanelCaches.delete(groupId);
}

/**
 * The same, into a personal chat. Also seeds the chat list when forwarding to
 * someone we've never messaged — otherwise the conversation we just created
 * wouldn't appear until the next refresh.
 */
export async function forwardMessagesToPersonalChat(
	user: PersonalChatUser,
	messages: ForwardableMessage[],
): Promise<void> {
	const ordered = oldestFirst(messages);

	let last: Awaited<ReturnType<typeof personalChatsService.sendMessage>> | null = null;
	for (const msg of ordered) {
		const attachments = msg.attachments as unknown as Attachment[];
		const res = await personalChatsService.sendMessage(
			user.id,
			msg.content,
			attachments,
			undefined,
			{
				authorId: msg.authorId,
				authorName: msg.author.displayName ?? msg.author.username,
				content: msg.content,
				attachments,
			},
		);
		last = res;
	}

	invalidateChatCache(user.id);
	if (!last) return;

	const preview = {
		content: last.message.content,
		authorId: last.message.authorId,
		createdAt: last.message.createdAt,
		attachments: (last.message.attachments ?? []).map((a) => ({ mimeType: a.mimeType })),
	};

	if (personalChatsStore.findByUserId(user.id)) {
		personalChatsStore.updateLastMessage(last.chatId, preview, false);
	} else {
		personalChatsStore.list = [
			{
				id: last.chatId,
				user,
				lastMessage: preview,
				unreadCount: 0,
				createdAt: new Date().toISOString(),
			},
			...personalChatsStore.list,
		];
	}
}
