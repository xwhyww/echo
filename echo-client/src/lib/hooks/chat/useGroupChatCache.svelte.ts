import type { Group, GroupMember } from '$lib/api/groups.js';
import type { ChatMessage, ChatPanelCache } from '$lib/chat/types.js';

// Lightweight per-group cache for the chat page header (group meta + member
// list). Messages, pinned messages, and scroll position are owned by
// <ChatPanel /> via `groupChatPanelCaches`.
export interface GroupHeaderCache {
	group: Group;
	members: GroupMember[];
}

export const MAX_CACHED_GROUPS = 50;
export const groupHeaderCaches = new Map<string, GroupHeaderCache>();
export const groupChatPanelCaches = new Map<string, ChatPanelCache>();

/**
 * Folds a message that arrived over the socket into a group's banked window.
 *
 * A mounted panel handles its own events and holds no cache entry while it is
 * up — it takes the entry on load and puts it back on the way out — so this
 * only ever fires for conversations nobody is looking at. Without it a warm
 * re-entry paints the window exactly as it was left and silently omits
 * everything said since, which is worse than the round-trip it saves.
 */
export function noteGroupMessageWhileAway(groupId: string, message: ChatMessage) {
	const cached = groupChatPanelCaches.get(groupId);
	if (!cached) return;
	if (cached.messages.some((m) => m.id === message.id)) return;
	groupChatPanelCaches.set(groupId, {
		...cached,
		messages: [...cached.messages, message],
	});
}
