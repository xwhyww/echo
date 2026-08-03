// Voice-channel chat — message types mirror the group chat shape, minus
// systemKind (voice chat doesn't generate join/leave system messages — the
// live participant list on the voice page covers that).

export interface VoiceChannelMessageAttachment {
	id: string;
	url: string;
	thumbUrl?: string | null;
	filename: string;
	mimeType: string;
	size: number;
	hash?: string;
	voice?: { duration: number; peaks: number[] } | null;
}

export interface VoiceChannelReplyToSnapshot {
	authorId: string;
	authorName: string;
	content: string;
	attachmentType?: string | null;
}

export interface VoiceChannelMessageReaction {
	emoji: string;
	count: number;
	userIds: string[];
	reactedAts: string[];
}

export interface VoiceChannelMessageAuthor {
	id: string;
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
}

export interface VoiceChannelMessage {
	id: string;
	channelId: string;
	groupId: string;
	authorId: string;
	content: string;
	attachments: VoiceChannelMessageAttachment[];
	isEdited: boolean;
	createdAt: string;
	updatedAt?: string;
	pinnedAt: string | null;
	pinnedBy: string | null;
	replyToId: string | null;
	replyToSnapshot: VoiceChannelReplyToSnapshot | null;
	forwardedFrom: unknown;
	author: VoiceChannelMessageAuthor;
	reactions: VoiceChannelMessageReaction[];
}

export interface VoiceChannelMessageListResponse {
	messages: VoiceChannelMessage[];
	hasMore: boolean;
	nextCursor: string | null;
}

export interface VoiceChannelPinnedResponse {
	messages: VoiceChannelMessage[];
}
