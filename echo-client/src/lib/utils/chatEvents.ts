import type { ChatMessage, ChatPanelEvent } from '$lib/chat/types.js';

/** The two lists a chat surface keeps: what's rendered, and what's pinned. */
export interface ChatListState {
	messages: ChatMessage[];
	pinnedMessages: ChatMessage[];
}

/**
 * Applies one normalised socket event to a chat's lists, or returns `null` when
 * nothing changed — a message we already have, most often, since the sender
 * sees its own send echoed back.
 *
 * Pure, and the same shape as `reduceVoiceListEvent` and `applyRoleEvent`: what
 * the event does to the data lives here, what it does to the *view* — scrolling,
 * marking read, dropping a deleted row from the selection — stays with the hook.
 */
export function applyChatEvent(
	state: ChatListState,
	e: ChatPanelEvent,
): ChatListState | null {
	const { messages, pinnedMessages } = state;

	// A change that has to reach both lists: the pinned bar shows the same
	// message object, and it would otherwise keep the stale copy.
	const patch = (messageId: string, change: (m: ChatMessage) => ChatMessage): ChatListState => ({
		messages: messages.map((m) => (m.id === messageId ? change(m) : m)),
		pinnedMessages: pinnedMessages.map((m) => (m.id === messageId ? change(m) : m)),
	});

	switch (e.kind) {
		case 'message':
			if (messages.some((m) => m.id === e.message.id)) return null;
			return { messages: [...messages, e.message], pinnedMessages };

		case 'edited':
			return patch(e.messageId, (m) => ({
				...m,
				content: e.content,
				attachments: e.attachments,
				isEdited: true,
				updatedAt: e.updatedAt,
			}));

		case 'deleted':
			return {
				messages: messages.filter((m) => m.id !== e.messageId),
				pinnedMessages: pinnedMessages.filter((m) => m.id !== e.messageId),
			};

		case 'pinned': {
			const next = patch(e.messageId, (m) => ({
				...m,
				pinnedAt: e.pinnedAt,
				pinnedBy: e.pinnedBy,
			}));
			// Newly pinned: it isn't in the bar yet, so put it at the front.
			const target = next.messages.find((m) => m.id === e.messageId);
			if (target && !pinnedMessages.some((p) => p.id === e.messageId)) {
				next.pinnedMessages = [target, ...next.pinnedMessages];
			}
			return next;
		}

		case 'unpinned': {
			const next = patch(e.messageId, (m) => ({ ...m, pinnedAt: null, pinnedBy: null }));
			next.pinnedMessages = next.pinnedMessages.filter((m) => m.id !== e.messageId);
			return next;
		}

		case 'reaction':
			return patch(e.messageId, (m) => ({ ...m, reactions: e.reactions }));
	}
}
