import type { Group, GroupMember } from '$lib/api/groups.js';
import type { ChatPanelCache } from '$lib/chat/types.js';

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
