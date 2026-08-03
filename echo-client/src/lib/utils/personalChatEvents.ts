import type { PersonalMessage } from '$lib/api/personalChats.js';
import type { WsEvent } from '$lib/stores/ws.svelte.js';

/** The two lists a personal chat keeps: what's rendered, and what's pinned. */
export interface DmListState {
	messages: PersonalMessage[];
	pinnedMessages: PersonalMessage[];
}

/**
 * Applies one socket event to a personal chat's lists, or returns `null` when
 * there's nothing to do — an event for another chat, or one this client already
 * applied optimistically when it made the request.
 *
 * Arriving messages are *not* handled here: appending one depends on where the
 * reader is looking, which is a question about the view. Everything else is a
 * plain data change, so it lives here and can be tested.
 */
export function applyDmEvent(
	state: DmListState,
	event: WsEvent,
	chatId: string | null,
	selfId: string | undefined,
): DmListState | null {
	if (!chatId) return null;
	const { messages, pinnedMessages } = state;

	const patch = (messageId: string, change: (m: PersonalMessage) => PersonalMessage): DmListState => ({
		messages: messages.map((m) => (m.id === messageId ? change(m) : m)),
		pinnedMessages: pinnedMessages.map((m) => (m.id === messageId ? change(m) : m)),
	});

	switch (event.type) {
		case 'dm_edited':
			if (event.chatId !== chatId) return null;
			return patch(event.messageId, (m) => ({
				...m,
				content: event.content,
				attachments: event.attachments,
				isEdited: true,
				updatedAt: event.updatedAt,
			}));

		case 'dm_deleted':
			if (event.chatId !== chatId) return null;
			return {
				messages: messages.filter((m) => m.id !== event.messageId),
				pinnedMessages: pinnedMessages.filter((m) => m.id !== event.messageId),
			};

		case 'dm_pinned': {
			if (event.chatId !== chatId) return null;
			// Our own pin already went in when the request returned.
			if (event.pinnedBy === selfId) return null;
			const target = messages.find((m) => m.id === event.messageId);
			const next = patch(event.messageId, (m) => ({
				...m,
				pinnedAt: event.pinnedAt,
				pinnedBy: event.pinnedBy,
			}));
			if (target && !pinnedMessages.some((p) => p.id === event.messageId)) {
				next.pinnedMessages = [
					{ ...target, pinnedAt: event.pinnedAt, pinnedBy: event.pinnedBy },
					...next.pinnedMessages,
				];
			}
			return next;
		}

		case 'dm_unpinned': {
			if (event.chatId !== chatId) return null;
			// Already gone from the bar means we did it ourselves.
			if (pinnedMessages.every((p) => p.id !== event.messageId)) return null;
			const next = patch(event.messageId, (m) => ({ ...m, pinnedAt: null, pinnedBy: null }));
			next.pinnedMessages = next.pinnedMessages.filter((m) => m.id !== event.messageId);
			return next;
		}

		case 'dm_reaction':
			if (event.chatId !== chatId) return null;
			return patch(event.messageId, (m) => ({ ...m, reactions: event.reactions }));

		default:
			return null;
	}
}
