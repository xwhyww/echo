import { auth } from '$lib/stores/auth.svelte.js';
import { ApiError } from '$lib/api/client.js';
import { blobService } from '$lib/api/blobService.js';
import { personalChatsService } from '$lib/api/personalChatsService.js';
import { personalChatsStore } from '$lib/stores/personalChats.svelte.js';
import { lastMessagePreview } from '$lib/utils/personalChatPreview.js';
import { optimisticReactions } from '$lib/utils/reactions.js';
import type { Attachment, MessageReaction, PersonalMessage } from '$lib/api/personalChats.js';

/**
 * What can be done to one message in a personal chat: edit it, delete it, pin,
 * unpin, react.
 *
 * The two lists these act on — what's rendered and what's pinned — belong to
 * `usePersonalChat`; this reaches them through the accessors it is handed, which
 * is the whole seam between them. Every change goes to both, because the pinned
 * bar shows the same message and would otherwise keep a stale copy.
 */
export function useDmMessageActions(options: {
	chatId: () => string | null;
	messages: () => PersonalMessage[];
	pinned: () => PersonalMessage[];
	setMessages: (next: PersonalMessage[]) => void;
	setPinned: (next: PersonalMessage[]) => void;
}) {
	function patchEverywhere(messageId: string, change: (m: PersonalMessage) => PersonalMessage) {
		options.setMessages(options.messages().map((m) => (m.id === messageId ? change(m) : m)));
		options.setPinned(options.pinned().map((m) => (m.id === messageId ? change(m) : m)));
	}

	function dropEverywhere(ids: Set<string>) {
		options.setMessages(options.messages().filter((m) => !ids.has(m.id)));
		options.setPinned(options.pinned().filter((m) => !ids.has(m.id)));
	}

	/** After a removal or an edit, the chat list's preview may be out of date. */
	function refreshPreviewIfLastChanged(wasLast: boolean) {
		const chatId = options.chatId();
		if (!wasLast || !chatId) return;
		const newLast = options.messages().at(-1);
		if (newLast) personalChatsStore.updateLastMessage(chatId, lastMessagePreview(newLast));
	}

	function find(messageId: string): PersonalMessage | undefined {
		return (
			options.messages().find((m) => m.id === messageId)
			?? options.pinned().find((m) => m.id === messageId)
		);
	}

	function applyReactions(messageId: string, reactions: MessageReaction[]) {
		patchEverywhere(messageId, (m) => ({ ...m, reactions }));
	}

	async function clearReaction(messageId: string) {
		const meId = auth.user?.id;
		if (!meId) return;
		const previous = find(messageId)?.reactions ?? [];
		applyReactions(messageId, optimisticReactions(previous, meId, null));
		try {
			const res = await personalChatsService.clearReaction(messageId);
			applyReactions(messageId, res.reactions);
		} catch (e) {
			console.error('Failed to clear reaction:', e);
			applyReactions(messageId, previous);
		}
	}

	return {
		async loadPinned() {
			const chatId = options.chatId();
			if (!chatId) return;
			try {
				const res = await personalChatsService.getPinned(chatId);
				options.setPinned(res.messages);
			} catch (e) {
				console.error('Failed to load pinned messages:', e);
			}
		},

		/** Returns an error message, or null when it worked. */
		async pin(messageId: string): Promise<string | null> {
			try {
				const res = await personalChatsService.pinMessage(messageId);
				const target = options.messages().find((m) => m.id === messageId);
				patchEverywhere(messageId, (m) => ({ ...m, pinnedAt: res.pinnedAt, pinnedBy: res.pinnedBy }));
				if (target && !options.pinned().some((p) => p.id === messageId)) {
					options.setPinned([
						{ ...target, pinnedAt: res.pinnedAt, pinnedBy: res.pinnedBy },
						...options.pinned(),
					]);
				}
				return null;
			} catch (e) {
				return e instanceof ApiError ? e.message : 'Failed to pin message';
			}
		},

		async unpin(messageId: string) {
			try {
				await personalChatsService.unpinMessage(messageId);
				patchEverywhere(messageId, (m) => ({ ...m, pinnedAt: null, pinnedBy: null }));
				options.setPinned(options.pinned().filter((m) => m.id !== messageId));
			} catch (e) {
				console.error('Failed to unpin message:', e);
			}
		},

		async edit(
			messageId: string,
			content: string,
			editedAttachments?: Attachment[],
			newFiles?: File[],
		) {
			try {
				let finalAttachments = editedAttachments;
				if (newFiles && newFiles.length > 0) {
					const { promise } = blobService.uploadFiles(newFiles);
					const uploadResult = await promise;
					finalAttachments = [...(finalAttachments ?? []), ...uploadResult.blobs];
				}

				const result = await personalChatsService.editMessage(messageId, content, finalAttachments);
				patchEverywhere(messageId, (m) => ({
					...m,
					content: result.message.content,
					attachments: (result.message.attachments ?? m.attachments) as Attachment[],
					isEdited: true,
					updatedAt: result.message.updatedAt,
				}));
				refreshPreviewIfLastChanged(options.messages().at(-1)?.id === messageId);
			} catch (e) {
				console.error('Failed to edit message:', e);
			}
		},

		async remove(messageId: string, mode: 'for_me' | 'for_everyone' = 'for_everyone') {
			try {
				await personalChatsService.deleteMessage(messageId, mode);
				const wasLast = options.messages().at(-1)?.id === messageId;
				dropEverywhere(new Set([messageId]));
				refreshPreviewIfLastChanged(wasLast);
			} catch (e) {
				console.error('Failed to delete message:', e);
			}
		},

		/** Returns the ids the server actually removed. */
		async removeMany(
			messageIds: string[],
			mode: 'for_me' | 'for_everyone' = 'for_everyone',
		): Promise<string[]> {
			try {
				const res = await personalChatsService.deleteMessages(messageIds, mode);
				const deleted = new Set(res.deleted);
				const hadLast = deleted.has(options.messages().at(-1)?.id ?? '');
				dropEverywhere(deleted);
				refreshPreviewIfLastChanged(hadLast);
				return res.deleted;
			} catch (e) {
				console.error('Failed to delete messages:', e);
				return [];
			}
		},

		/** Returns an error message, or null when it worked. */
		async react(messageId: string, emoji: string): Promise<string | null> {
			const meId = auth.user?.id;
			if (!meId) return null;
			const target = find(messageId);
			const mine = target?.reactions?.find((r) => r.userIds.includes(meId));
			// Toggle: clicking the emoji you already set takes it back.
			if (mine && mine.emoji === emoji) {
				await clearReaction(messageId);
				return null;
			}
			applyReactions(messageId, optimisticReactions(target?.reactions, meId, emoji));
			try {
				const res = await personalChatsService.setReaction(messageId, emoji);
				applyReactions(messageId, res.reactions);
				return null;
			} catch (e) {
				console.error('Failed to set reaction:', e);
				applyReactions(messageId, target?.reactions ?? []);
				return e instanceof Error ? e.message : 'Failed to set reaction';
			}
		},

		clearReaction,
	};
}
