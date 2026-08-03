export interface PersonalChatUser {
	id: string;
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
	isOnline: boolean;
	privacyMessaging?: string;
}

export interface FriendshipStatus {
	status: 'none' | 'friends' | 'pending' | 'self';
	direction?: 'incoming' | 'outgoing';
}

export interface LastMessageAttachment {
	mimeType: string;
	voice?: boolean;
}

export interface LastMessage {
	content: string;
	authorId: string;
	createdAt: string;
	attachments?: LastMessageAttachment[];
}

export interface UnseenReaction {
	emoji: string;
	messageId: string;
}

export interface PersonalChat {
	id: string;
	temp?: boolean;
	user: PersonalChatUser;
	lastMessage: LastMessage | null;
	unreadCount: number;
	isLastMessageRead?: boolean | null;
	lastMessageReadAt?: string | null;
	unseenReaction?: UnseenReaction | null;
	createdAt: string;
}

export interface MessageAuthor {
	id: string;
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
}

export interface VoiceMeta {
	// Duration in seconds (float, e.g. 12.34).
	duration: number;
	// Pre-computed waveform peaks, integers 0..100. Fixed-length (~48 bars) so
	// the player can render a Telegram-style waveform without decoding the
	// audio blob on every chat row.
	peaks: number[];
}

export interface Attachment {
	id: string;
	url: string;
	// 200px WebP thumbnail; only set for image uploads. Use this for inline
	// previews (chat bubble image, media grid). Falls through to `url` for
	// non-image attachments and for older blobs that pre-date thumbnails.
	thumbUrl?: string | null;
	filename: string;
	mimeType: string;
	size: number;
	// Present iff this attachment is a recorded voice message — it carries the
	// waveform and duration captured at record time. Plain audio uploads are
	// also played inline (AudioAttachment), but have no waveform, so this stays
	// the discriminator between the two renderers.
	voice?: VoiceMeta | null;
}

export interface ReplyToSnapshot {
	authorId: string;
	authorName: string;
	content: string;
	attachmentType?: string | null;
}

export interface ForwardedFrom {
	authorId: string;
	authorName: string;
	content: string;
	attachments: Attachment[];
}

export interface MessageReaction {
	emoji: string;
	count: number;
	userIds: string[];
	reactedAts: string[];
}

export interface PersonalMessage {
	id: string;
	chatId: string;
	authorId: string;
	content: string;
	attachments: Attachment[];
	isEdited: boolean;
	createdAt: string;
	updatedAt: string;
	readAt?: string | null;
	pinnedAt?: string | null;
	pinnedBy?: string | null;
	replyToId?: string | null;
	replyToSnapshot?: ReplyToSnapshot | null;
	forwardedFrom?: ForwardedFrom | null;
	reactions?: MessageReaction[];
	author: MessageAuthor;
}
