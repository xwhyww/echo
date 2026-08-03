export type GroupRole = 'owner' | 'admin' | 'member';

export type GroupInvitePolicy = 'owner' | 'admins' | 'everyone';
export type GroupMessagePolicy = 'owner' | 'admins' | 'everyone';
export type GroupPinPolicy = 'owner' | 'admins' | 'everyone';
export type GroupEditInfoPolicy = 'owner' | 'admins';

export interface Group {
	id: string;
	name: string;
	description: string | null;
	avatarUrl: string | null;
	ownerId: string;
	isPublic: boolean;
	createdAt: string;
	role: GroupRole;
	inviteCode?: string | null;
	invitePolicy?: GroupInvitePolicy;
	messagePolicy?: GroupMessagePolicy;
	pinPolicy?: GroupPinPolicy;
	editInfoPolicy?: GroupEditInfoPolicy;
	historyVisible?: boolean;
	// Optional sidebar enrichments populated only by the listing endpoint.
	// Other endpoints (e.g. group create) leave these undefined so callers
	// must guard before reading them.
	lastMessage?: GroupListLastMessage | null;
	unreadCount?: number;
	isLastMessageRead?: boolean | null;
	lastReadAt?: string | null;
}

// Slim shape for sidebar previews — just enough to render text + timestamp
// + read indicator. The full GroupMessage shape is heavier (reactions, edits,
// reply snapshots) and unnecessary for a one-line summary.
export interface GroupListLastMessage {
	id: string;
	groupId: string;
	authorId: string;
	// Flat author fields populated by the listing endpoint. WS-pushed
	// GroupMessages use the nested `author` shape instead, so consumers may
	// need to read either form.
	authorUsername?: string;
	authorDisplayName?: string | null;
	content: string;
	attachments: unknown[];
	createdAt: string;
	systemKind: string | null;
}

export interface GroupMember {
	userId: string;
	role: GroupRole;
	nickname: string | null;
	joinedAt: string;
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
	isOnline?: boolean;
}

export interface GroupAttachment {
	id: string;
	url: string;
	thumbUrl?: string | null;
	filename: string;
	mimeType: string;
	size: number;
	hash?: string;
	// Recorded voice messages — same shape as DM attachments. Stored as opaque
	// jsonb on the server so it round-trips without backend changes.
	voice?: { duration: number; peaks: number[] } | null;
}

export interface GroupReplyToSnapshot {
	authorId: string;
	authorName: string;
	content: string;
	attachmentType?: string | null;
}

export interface GroupMessageReaction {
	emoji: string;
	count: number;
	userIds: string[];
	reactedAts: string[];
}

export interface GroupMessageAuthor {
	id: string;
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
}

export interface GroupMessage {
	id: string;
	groupId: string;
	authorId: string;
	content: string;
	attachments: GroupAttachment[];
	isEdited: boolean;
	createdAt: string;
	updatedAt?: string;
	pinnedAt: string | null;
	pinnedBy: string | null;
	systemKind: string | null;
	replyToId: string | null;
	replyToSnapshot: GroupReplyToSnapshot | null;
	forwardedFrom: unknown;
	author: GroupMessageAuthor;
	reactions: GroupMessageReaction[];
}

export interface GroupInvite {
	id: string;
	groupId: string;
	groupName: string;
	groupAvatarUrl: string | null;
	inviterId: string;
	inviterUsername: string;
	inviterDisplayName?: string | null;
	createdAt: string;
}
