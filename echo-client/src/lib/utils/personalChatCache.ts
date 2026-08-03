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
