import type { MessageReaction, PersonalMessage } from '$lib/api/personalChats.js';
import { rememberChat } from '$lib/utils/chatCache.js';

/**
 * The warm cache of personal chats: everything needed to put a conversation
 * back on screen exactly as it was left, keyed by companion id.
 *
 * It outlives `usePersonalChat` — the whole point is that the hook is torn down
 * on navigation and the conversation survives it — so the map lives at module
 * level, not in the hook. Keeping it here also means the two things that reach
 * into the cache from outside a chat (forwarding, a reaction arriving for a chat
 * nobody is looking at) no longer have to import a hook to do it.
 */
export interface ChatCache {
	chatId: string;
	messages: PersonalMessage[];
	otherLastReadAt: string | null;
	hasOlder: boolean;
	hasNewer: boolean;
	nextCursor: string | null;
	newerCursor: string | null;
	draft: string;
	firstUnreadMessageId: string | null;
	scrollPosition: number | null; // pixels from bottom, null = pinned to bottom
	pinnedMessages: PersonalMessage[];
}

const MAX_CACHED_CHATS = 100;

const chatCaches = new Map<string, ChatCache>();

/**
 * Takes the cached conversation, removing it from the cache — whoever restores
 * it now owns it and writes it back on the way out. Leaving a copy behind would
 * mean a second reader restoring state that is already being edited.
 */
export function takeCachedChat(companionId: string): ChatCache | undefined {
	const cached = chatCaches.get(companionId);
	if (cached) chatCaches.delete(companionId);
	return cached;
}

export function cacheChat(companionId: string, entry: ChatCache): void {
	rememberChat(chatCaches, companionId, entry, MAX_CACHED_CHATS);
}

/** Drop the cache entry for a companion so the next visit triggers a fresh
 * fetch. Use this when an action outside `usePersonalChat` mutated the chat
 * (e.g. forwarding from a group page). */
export function invalidateChatCache(companionId: string): void {
	chatCaches.delete(companionId);
}

/**
 * Folds a message that arrived over the socket into a banked conversation.
 *
 * The chat being viewed holds no entry here — `takeCachedChat` hands ownership
 * to the hook and it writes back on the way out — so this only ever fires for
 * conversations nobody is looking at. Without it the sidebar row updates while
 * the window behind it does not, and opening the chat restores it exactly as it
 * was left: the message you were just told about is missing, and nothing
 * refetches because the cache counted as a hit.
 *
 * A window showing history is left alone. `hasNewer` means there is already a
 * gap between it and the end of the conversation, so appending would splice the
 * newest message onto a window it is not continuous with; paging down fills
 * that in properly.
 */
export function noteMessageWhileAway(chatId: string, message: PersonalMessage): void {
	for (const cache of chatCaches.values()) {
		if (cache.chatId !== chatId) continue;
		if (cache.hasNewer) continue;
		if (cache.messages.some((m) => m.id === message.id)) continue;
		cache.messages = [...cache.messages, message];
	}
}

/** Apply a reactions update to cached (non-currently-viewed) chats so that
 * when the user navigates back the reactions are already present. */
export function applyReactionsToCache(
	chatId: string,
	messageId: string,
	reactions: MessageReaction[],
): void {
	for (const cache of chatCaches.values()) {
		if (cache.chatId !== chatId) continue;
		cache.messages = cache.messages.map((m) =>
			m.id === messageId ? { ...m, reactions } : m,
		);
		cache.pinnedMessages = cache.pinnedMessages.map((m) =>
			m.id === messageId ? { ...m, reactions } : m,
		);
	}
}
