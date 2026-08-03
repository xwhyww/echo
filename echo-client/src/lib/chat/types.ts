// Shared types for the <ChatPanel /> orchestration component. Group and
// voice-channel chats both produce values that satisfy these shapes — the
// concrete services (groupsService, voiceChatService) plug in directly.

export interface ChatAttachment {
	id: string;
	url: string;
	thumbUrl?: string | null;
	filename: string;
	mimeType: string;
	size: number;
	hash?: string;
	voice?: { duration: number; peaks: number[] } | null;
}

export interface ChatReaction {
	emoji: string;
	count: number;
	userIds: string[];
	reactedAts: string[];
}

export interface ChatReplyToSnapshot {
	authorId: string;
	authorName: string;
	content: string;
	attachmentType?: string | null;
}

export interface ChatAuthor {
	id: string;
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
}

export interface ChatMessage {
	id: string;
	authorId: string;
	content: string;
	attachments: ChatAttachment[];
	isEdited: boolean;
	createdAt: string;
	updatedAt?: string;
	pinnedAt: string | null;
	pinnedBy: string | null;
	// Group chat only — voice chat never produces system messages, so this is
	// always nullish there. ChatPanel renders these as a centered system row
	// instead of a ChatBubble.
	systemKind?: string | null;
	replyToId: string | null;
	replyToSnapshot: ChatReplyToSnapshot | null;
	forwardedFrom: unknown;
	author: ChatAuthor;
	reactions: ChatReaction[];
}

// The service surface ChatPanel relies on. Both `groupsService` and
// `voiceChatService` already match this — no shims needed.
export interface ChatService<
	TMsg extends ChatMessage = ChatMessage,
	TAtt extends ChatAttachment = ChatAttachment,
> {
	getMessages(
		id: string,
		opts?: { cursor?: string; after?: string; limit?: number },
	): Promise<{ messages: TMsg[]; hasMore: boolean; nextCursor: string | null }>;
	sendMessage(
		id: string,
		content: string,
		attachments?: TAtt[],
		replyToId?: string,
		forwardedFrom?: {
			authorId: string;
			authorName: string;
			content: string;
			attachments?: TAtt[];
		} | null,
	): Promise<{ message: TMsg }>;
	editMessage(messageId: string, content: string, attachments?: TAtt[]): Promise<{ message: TMsg }>;
	deleteMessage(messageId: string): Promise<{ success: boolean }>;
	markRead(id: string): Promise<{ success: boolean }>;
	getPinned(id: string): Promise<{ messages: TMsg[] }>;
	pin(messageId: string): Promise<{ success: boolean; pinnedAt: string; pinnedBy: string }>;
	unpin(messageId: string): Promise<{ success: boolean }>;
	toggleReaction(messageId: string, emoji: string): Promise<{ reactions: ChatReaction[] }>;
}

// A normalized event shape. Each surface filters its WsEvent union and
// returns null for events that don't belong to it. This keeps ChatPanel from
// having to know the difference between `group_message` and
// `voice_channel_message` (their fields are otherwise identical).
export type ChatPanelEvent =
	| { kind: 'message'; message: ChatMessage }
	| { kind: 'edited'; messageId: string; content: string; attachments: ChatAttachment[]; updatedAt: string }
	| { kind: 'deleted'; messageId: string }
	| { kind: 'pinned'; messageId: string; pinnedAt: string; pinnedBy: string }
	| { kind: 'unpinned'; messageId: string }
	| { kind: 'reaction'; messageId: string; reactions: ChatReaction[] };

export interface ChatPanelCache {
	messages: ChatMessage[];
	pinnedMessages: ChatMessage[];
	hasMore: boolean;
	nextCursor: string | null;
	scrollPosition: number | null; // pixels from bottom; null = pinned to bottom
}

export const MAX_CACHED_CHATS = 50;
