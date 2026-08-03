import { api } from './client.js';
import type { PersonalChat, PersonalChatUser, PersonalMessage, Attachment, ForwardedFrom } from './personalChats.js';

class PersonalChatsService {
	getAll(opts?: { cursor?: string; search?: string }) {
		const params = new URLSearchParams();
		if (opts?.cursor) params.set('cursor', opts.cursor);
		if (opts?.search) params.set('search', opts.search);
		const qs = params.toString();
		return api<{ chats: PersonalChat[]; hasMore: boolean; nextCursor: string | null }>(
			`/personal-chats${qs ? `?${qs}` : ''}`,
		);
	}

	create(username: string) {
		return api<{ chat: PersonalChat }>('/personal-chats', {
			method: 'POST',
			body: { username },
		});
	}

	async getByCompanionId(userId: string): Promise<{
		chat: PersonalChat | null;
		user?: PersonalChatUser;
	}> {
		try {
			return await api<{
				chat: PersonalChat | null;
				user?: PersonalChatUser;
			}>(`/personal-chats/by-user/${userId}`);
		} catch {
			return { chat: null };
		}
	}

	getMessages(chatId: string, cursor?: string, signal?: AbortSignal) {
		const params = new URLSearchParams();
		if (cursor) params.set('cursor', cursor);
		const qs = params.toString();
		return api<{ messages: PersonalMessage[]; otherLastReadAt: string | null; hasMore: boolean; hasOlder: boolean; hasNewer: boolean; nextCursor: string | null; newerCursor: string | null }>(
			`/personal-chats/${chatId}/messages${qs ? `?${qs}` : ''}`,
			{ signal },
		);
	}

	getMessagesAfter(chatId: string, afterCursor: string, limit?: number, signal?: AbortSignal) {
		const params = new URLSearchParams();
		params.set('after', afterCursor);
		if (limit) params.set('limit', String(limit));
		return api<{ messages: PersonalMessage[]; hasOlder: boolean; hasNewer: boolean; newerCursor: string | null }>(
			`/personal-chats/${chatId}/messages?${params.toString()}`,
			{ signal },
		);
	}

	getMessagesAround(chatId: string, messageId: string, limit?: number) {
		const params = new URLSearchParams();
		params.set('around', messageId);
		if (limit) params.set('limit', String(limit));
		return api<{ messages: PersonalMessage[]; otherLastReadAt: string | null; hasOlder: boolean; hasNewer: boolean; nextCursor: string | null; newerCursor: string | null }>(
			`/personal-chats/${chatId}/messages?${params.toString()}`,
		);
	}

	markAsRead(chatId: string) {
		return api<{ success: boolean }>(`/personal-chats/${chatId}/read`, {
			method: 'POST',
		});
	}

	sendMessage(
		userId: string,
		content: string,
		attachments?: Attachment[],
		replyToId?: string,
		forwardedFrom?: { authorId: string; authorName: string; content: string; attachments?: Attachment[] } | null,
	) {
		return api<{ message: PersonalMessage; chatId: string }>('/personal-chats/send', {
			method: 'POST',
			body: { userId, content, attachments, replyToId, forwardedFrom },
		});
	}

	editMessage(messageId: string, content: string, attachments?: Attachment[]) {
		const body: Record<string, unknown> = { content };
		if (attachments !== undefined) body.attachments = attachments;
		return api<{ message: PersonalMessage }>(`/personal-chats/messages/${messageId}`, {
			method: 'PATCH',
			body,
		});
	}

	deleteMessage(messageId: string, mode: 'for_me' | 'for_everyone' = 'for_everyone') {
		return api<{ success: boolean }>(`/personal-chats/messages/${messageId}?mode=${mode}`, {
			method: 'DELETE',
		});
	}

	deleteMessages(messageIds: string[], mode: 'for_me' | 'for_everyone' = 'for_everyone') {
		return api<{ success: boolean; deleted: string[] }>('/personal-chats/messages/batch-delete', {
			method: 'POST',
			body: { messageIds, mode },
		});
	}

	forwardMessages(messageIds: string[], targetUserId: string) {
		return api<{ messages: PersonalMessage[]; chatId: string }>('/personal-chats/forward', {
			method: 'POST',
			body: { messageIds, targetUserId },
		});
	}

	pinMessage(messageId: string) {
		return api<{ success: boolean; pinnedAt: string; pinnedBy: string }>(
			`/personal-chats/messages/${messageId}/pin`,
			{ method: 'POST' },
		);
	}

	unpinMessage(messageId: string) {
		return api<{ success: boolean }>(
			`/personal-chats/messages/${messageId}/pin`,
			{ method: 'DELETE' },
		);
	}

	setReaction(messageId: string, emoji: string) {
		return api<{ reactions: { emoji: string; count: number; userIds: string[]; reactedAts: string[] }[] }>(
			`/personal-chats/messages/${messageId}/reaction`,
			{ method: 'PUT', body: { emoji } },
		);
	}

	clearReaction(messageId: string) {
		return api<{ reactions: { emoji: string; count: number; userIds: string[]; reactedAts: string[] }[] }>(
			`/personal-chats/messages/${messageId}/reaction`,
			{ method: 'DELETE' },
		);
	}

	getPinned(chatId: string) {
		return api<{ messages: PersonalMessage[] }>(`/personal-chats/${chatId}/pinned`);
	}

	searchMessages(chatId: string, query: string, cursor?: string | null, signal?: AbortSignal) {
		const params = new URLSearchParams();
		params.set('q', query);
		if (cursor) params.set('cursor', cursor);
		return api<{
			messages: Array<{
				id: string;
				chatId: string;
				authorId: string;
				content: string;
				attachments: Attachment[];
				createdAt: string;
				author: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
			}>;
			hasMore: boolean;
			nextCursor: string | null;
		}>(`/personal-chats/${chatId}/search?${params.toString()}`, { signal });
	}

	getStats(chatId: string) {
		return api<{
			messages: number;
			links: number;
			photos: number;
			videos: number;
			files: number;
			gifs: number;
			/** Uploaded audio files — excludes recorded voice notes. */
			audio: number;
			voiceMessages: number;
		}>(`/personal-chats/${chatId}/stats`);
	}

	getLinks(chatId: string, cursor?: string | null, signal?: AbortSignal) {
		const params = new URLSearchParams();
		params.set('kind', 'links');
		if (cursor) params.set('cursor', cursor);
		return api<{
			items: { messageId: string; createdAt: string; url: string }[];
			hasMore: boolean;
			nextCursor: string | null;
		}>(`/personal-chats/${chatId}/media?${params.toString()}`, { signal });
	}

	getMedia(chatId: string, kind: 'photos' | 'videos' | 'gifs' | 'audio' | 'files', cursor?: string | null, signal?: AbortSignal) {
		const params = new URLSearchParams();
		params.set('kind', kind);
		if (cursor) params.set('cursor', cursor);
		return api<{
			items: { messageId: string; createdAt: string; attachment: Attachment }[];
			hasMore: boolean;
			nextCursor: string | null;
		}>(`/personal-chats/${chatId}/media?${params.toString()}`, { signal });
	}

}

export const personalChatsService = new PersonalChatsService();
