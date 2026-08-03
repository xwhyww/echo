import { api } from './client.js';
import type {
	VoiceChannelMessage,
	VoiceChannelMessageAttachment,
	VoiceChannelMessageListResponse,
	VoiceChannelPinnedResponse,
	VoiceChannelMessageReaction,
} from './voiceChat.js';

class VoiceChatService {
	getMessages(channelId: string, opts?: { cursor?: string; after?: string; limit?: number }) {
		const params = new URLSearchParams();
		if (opts?.cursor) params.set('cursor', opts.cursor);
		if (opts?.after) params.set('after', opts.after);
		if (opts?.limit) params.set('limit', String(opts.limit));
		const qs = params.toString();
		return api<VoiceChannelMessageListResponse>(
			`/voice/channels/${channelId}/messages${qs ? `?${qs}` : ''}`,
		);
	}

	sendMessage(
		channelId: string,
		content: string,
		attachments?: VoiceChannelMessageAttachment[],
		replyToId?: string,
		forwardedFrom?: { authorId: string; authorName: string; content: string; attachments?: VoiceChannelMessageAttachment[] } | null,
	) {
		return api<{ message: VoiceChannelMessage }>(`/voice/channels/${channelId}/messages`, {
			method: 'POST',
			body: { content, attachments, replyToId, forwardedFrom },
		});
	}

	editMessage(messageId: string, content: string, attachments?: VoiceChannelMessageAttachment[]) {
		const body: Record<string, unknown> = { content };
		if (attachments !== undefined) body.attachments = attachments;
		return api<{ message: VoiceChannelMessage }>(`/voice/messages/${messageId}`, {
			method: 'PATCH',
			body,
		});
	}

	deleteMessage(messageId: string) {
		return api<{ success: boolean }>(`/voice/messages/${messageId}`, { method: 'DELETE' });
	}

	markRead(channelId: string) {
		return api<{ success: boolean }>(`/voice/channels/${channelId}/read`, { method: 'POST' });
	}

	getPinned(channelId: string) {
		return api<VoiceChannelPinnedResponse>(`/voice/channels/${channelId}/pinned`);
	}

	pin(messageId: string) {
		return api<{ success: boolean; pinnedAt: string; pinnedBy: string }>(
			`/voice/messages/${messageId}/pin`,
			{ method: 'POST' },
		);
	}

	unpin(messageId: string) {
		return api<{ success: boolean }>(`/voice/messages/${messageId}/pin`, { method: 'DELETE' });
	}

	toggleReaction(messageId: string, emoji: string) {
		return api<{ reactions: VoiceChannelMessageReaction[] }>(
			`/voice/messages/${messageId}/reactions`,
			{ method: 'POST', body: { emoji } },
		);
	}
}

export const voiceChatService = new VoiceChatService();
