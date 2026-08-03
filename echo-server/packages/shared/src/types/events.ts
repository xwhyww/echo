export interface UserCreatedEvent {
	id: string;
	email: string | null;
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
	phone: string | null;
}

export interface UserUpdatedEvent {
	id: string;
	username?: string;
	email?: string | null;
	displayName?: string | null;
	avatarUrl?: string | null;
	phone?: string | null;
	status?: string | null;
	privacyOnlineStatus?: string;
	privacyPhone?: string;
	privacyEmail?: string;
	privacyMessaging?: string;
	privacyProfile?: string;
	privacyPhoto?: string;
	privacyGroupInvite?: string;
}

export interface PresenceEvent {
	userId: string;
	online: boolean;
}

export interface DmAttachment {
	id: string;
	url: string;
	filename: string;
	mimeType: string;
	size: number;
}

export interface ReplyToSnapshot {
	authorId: string;
	authorName: string;
	content: string;
	attachmentType?: string | null;
}

export interface ForwardedFromSnapshot {
	authorId: string;
	authorName: string;
	content: string;
	attachments: DmAttachment[];
}

export interface DmMessageEvent {
	targetUserId: string;
	chatId: string;
	message: {
		id: string;
		chatId: string;
		authorId: string;
		content: string;
		attachments: DmAttachment[];
		isEdited: boolean;
		createdAt: string;
		replyToId?: string | null;
		replyToSnapshot?: ReplyToSnapshot | null;
		forwardedFrom?: ForwardedFromSnapshot | null;
		author: {
			id: string;
			username: string;
			displayName: string | null;
			avatarUrl: string | null;
		};
	};
	unreadCount?: number;
}

export interface DmMessageEditedEvent {
	targetUserId: string;
	chatId: string;
	messageId: string;
	content: string;
	attachments: DmAttachment[];
	updatedAt: string;
}

export interface DmMessageDeletedEvent {
	targetUserId: string;
	chatId: string;
	messageId: string;
}

export interface DmMessagePinnedEvent {
	targetUserId: string;
	chatId: string;
	messageId: string;
	pinnedAt: string;
	pinnedBy: string;
}

export interface DmMessageUnpinnedEvent {
	targetUserId: string;
	chatId: string;
	messageId: string;
}

export interface DmReactionSummary {
	emoji: string;
	count: number;
	userIds: string[];
	reactedAts: string[];
}

export interface DmMessageReactionUpdatedEvent {
	targetUserId: string;
	chatId: string;
	messageId: string;
	messageAuthorId: string;
	reactions: DmReactionSummary[];
}

// ─── 1-to-1 calls ────────────────────────────────────────────────
// All call signalling events are addressed to a single recipient. The ring
// carries the caller's profile so the callee can render the incoming-call
// prompt without a lookup; the other signals only need to identify the peer
// and the shared LiveKit room.

export interface CallParty {
	id: string;
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
}

export interface CallRingEvent {
	targetUserId: string;
	roomName: string;
	from: CallParty;
	// True when the caller started with their camera on. Purely a hint for the
	// callee's prompt ("incoming video call"); either side can toggle video
	// once connected.
	video: boolean;
}

// accepted / declined / cancelled / ended all share this shape.
export interface CallSignalEvent {
	targetUserId: string;
	roomName: string;
	fromUserId: string;
}

export interface DmReadEvent {
	targetUserId: string;
	chatId: string;
	userId: string;
	lastReadAt: string;
}

export interface FriendEvent {
	type: 'friend_request' | 'friend_accepted' | 'friend_removed' | 'friend_declined' | 'friend_cancelled';
	fromUserId: string;
	toUserId: string;
}

export interface DmChatCreatedEvent {
	chatId: string;
	userIds: string[];
}

export interface DmChatDeletedEvent {
	chatId: string;
}

// ─── Group events ────────────────────────────────────────────────

export interface GroupSummary {
	id: string;
	name: string;
	description: string | null;
	avatarUrl: string | null;
	ownerId: string;
	isPublic: boolean;
	invitePolicy?: 'owner' | 'admins' | 'everyone';
	messagePolicy?: 'owner' | 'admins' | 'everyone';
	pinPolicy?: 'owner' | 'admins' | 'everyone';
	editInfoPolicy?: 'owner' | 'admins';
	historyVisible?: boolean;
	createdAt: string;
}

export interface GroupMemberSummary {
	userId: string;
	role: 'owner' | 'admin' | 'member';
	nickname: string | null;
	joinedAt: string;
}

export interface GroupCreatedEvent {
	targetUserIds: string[];
	group: GroupSummary;
	memberIds: string[];
}

export interface GroupUpdatedEvent {
	targetUserIds: string[];
	groupId: string;
	patch: Partial<Pick<GroupSummary, 'name' | 'description' | 'avatarUrl' | 'isPublic' | 'ownerId' | 'invitePolicy' | 'messagePolicy' | 'pinPolicy' | 'editInfoPolicy' | 'historyVisible'>>;
}

export interface GroupDeletedEvent {
	targetUserIds: string[];
	groupId: string;
}

export interface GroupMemberJoinedEvent {
	targetUserIds: string[];
	groupId: string;
	member: GroupMemberSummary & { user: { id: string; username: string; displayName: string | null; avatarUrl: string | null } };
}

export interface GroupMemberLeftEvent {
	targetUserIds: string[];
	groupId: string;
	userId: string;
	kicked: boolean;
}

export interface GroupMemberRoleChangedEvent {
	targetUserIds: string[];
	groupId: string;
	userId: string;
	role: 'owner' | 'admin' | 'member';
}

export interface GroupInviteCreatedEvent {
	targetUserIds: string[]; // typically [inviteeId]
	invite: {
		id: string;
		groupId: string;
		groupName: string;
		groupAvatarUrl: string | null;
		inviterId: string;
		inviterUsername: string;
		createdAt: string;
	};
}

export interface GroupInviteRespondedEvent {
	targetUserIds: string[];
	inviteId: string;
	groupId: string;
	inviteeId: string;
	status: 'accepted' | 'declined' | 'revoked';
}

export interface GroupMessageAttachment {
	id: string;
	url: string;
	filename: string;
	mimeType: string;
	size: number;
	hash?: string;
	thumbUrl?: string | null;
}

export interface GroupMessagePayload {
	id: string;
	groupId: string;
	authorId: string;
	content: string;
	attachments: GroupMessageAttachment[];
	isEdited: boolean;
	createdAt: string;
	systemKind?: string | null;
	replyToId?: string | null;
	replyToSnapshot?: ReplyToSnapshot | null;
	forwardedFrom?: ForwardedFromSnapshot | null;
	author: {
		id: string;
		username: string;
		displayName: string | null;
		avatarUrl: string | null;
	};
}

export interface GroupMessageEvent {
	targetUserIds: string[];
	groupId: string;
	message: GroupMessagePayload;
}

export interface GroupMessageEditedEvent {
	targetUserIds: string[];
	groupId: string;
	messageId: string;
	content: string;
	attachments: GroupMessageAttachment[];
	updatedAt: string;
}

export interface GroupMessageDeletedEvent {
	targetUserIds: string[];
	groupId: string;
	messageId: string;
}

export interface GroupMessagePinnedEvent {
	targetUserIds: string[];
	groupId: string;
	messageId: string;
	pinnedAt: string;
	pinnedBy: string;
}

export interface GroupMessageUnpinnedEvent {
	targetUserIds: string[];
	groupId: string;
	messageId: string;
}

export interface GroupMessageReactionUpdatedEvent {
	targetUserIds: string[];
	groupId: string;
	messageId: string;
	messageAuthorId: string;
	reactions: DmReactionSummary[];
}

export interface GroupReadEvent {
	targetUserIds: string[];
	groupId: string;
	userId: string;
	lastReadAt: string;
}

// ─── Voice events ────────────────────────────────────────────────

export interface VoiceParticipantPayload {
	userId: string;
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
	micMuted: boolean;
	deafened: boolean;
	sharing: boolean;
}

// One event type covers join, leave, and in-call state changes (mic/deafen).
// `kind` discriminates so subscribers can update incrementally without an
// extra round-trip to refetch the channel list.
export interface VoiceParticipantEvent {
	targetUserIds: string[];
	groupId: string;
	channelId: string;
	kind: 'joined' | 'left' | 'updated';
	participant: VoiceParticipantPayload;
}

export interface VoiceChannelSummary {
	id: string;
	groupId: string;
	categoryId: string | null;
	name: string;
	createdBy: string;
	createdAt: string;
}

export interface VoiceChannelCreatedEvent {
	targetUserIds: string[];
	channel: VoiceChannelSummary;
}

export interface VoiceChannelUpdatedEvent {
	targetUserIds: string[];
	groupId: string;
	channelId: string;
	patch: Partial<Pick<VoiceChannelSummary, 'name' | 'categoryId'>>;
}

export interface VoiceChannelDeletedEvent {
	targetUserIds: string[];
	groupId: string;
	channelId: string;
}

export interface VoiceCategorySummary {
	id: string;
	groupId: string;
	name: string;
	position: number;
	createdBy: string;
	createdAt: string;
}

export interface VoiceCategoryCreatedEvent {
	targetUserIds: string[];
	category: VoiceCategorySummary;
}

export interface VoiceCategoryUpdatedEvent {
	targetUserIds: string[];
	groupId: string;
	categoryId: string;
	patch: Partial<Pick<VoiceCategorySummary, 'name' | 'position'>>;
}

export interface VoiceCategoryDeletedEvent {
	targetUserIds: string[];
	groupId: string;
	categoryId: string;
}

// ─── Voice role permissions ─────────────────────────────────────
// Bitfield. CONNECT = "can join channels" — required to enter any restricted
// channel. SPEAK = "can publish microphone" — without it, the LiveKit token
// omits the microphone source so the user is server-side muted. CAN_SHARE =
// "can publish a screen share" — without it, the token omits the screen-share
// sources so a tampered client still can't present. The two MANAGE flags grant
// access to the corresponding /voice management surfaces (channels/categories
// CRUD; roles CRUD + member assignment). Owner/admin in the group always have
// everything implicitly — roles are additive on top.

export const VOICE_PERMS = {
	CONNECT: 1,
	SPEAK: 2,
	MANAGE_CHANNELS: 4,
	MANAGE_ROLES: 8,
	CAN_SHARE: 16,
} as const;
export type VoicePermissionBit = typeof VOICE_PERMS[keyof typeof VOICE_PERMS];

export interface VoiceRoleSummary {
	id: string;
	groupId: string;
	name: string;
	color: string | null;
	permissions: number;
	position: number;
	createdBy: string;
	createdAt: string;
}

export interface VoiceRoleCreatedEvent {
	targetUserIds: string[];
	role: VoiceRoleSummary;
}

export interface VoiceRoleUpdatedEvent {
	targetUserIds: string[];
	groupId: string;
	roleId: string;
	patch: Partial<Pick<VoiceRoleSummary, 'name' | 'color' | 'permissions' | 'position'>>;
}

export interface VoiceRoleDeletedEvent {
	targetUserIds: string[];
	groupId: string;
	roleId: string;
}

// Members joined/left a role. Single event with a discriminator keeps the
// gateway fanout uniform; clients reconcile by patching their role->member map.
export interface VoiceRoleMembersChangedEvent {
	targetUserIds: string[];
	groupId: string;
	roleId: string;
	kind: 'added' | 'removed';
	userId: string;
}

// Channel-level access list changed (allowlist roles added/removed). Clients
// re-list channels on receipt so the sidebar visibility re-evaluates.
export interface VoiceChannelAccessChangedEvent {
	targetUserIds: string[];
	groupId: string;
	channelId: string;
	roleIds: string[]; // full current allowlist after the change
}

// ─── Voice channel chat events ──────────────────────────────────

export interface VoiceChannelMessageAttachment {
	id: string;
	url: string;
	filename: string;
	mimeType: string;
	size: number;
	hash?: string;
	thumbUrl?: string | null;
}

export interface VoiceChannelMessagePayload {
	id: string;
	channelId: string;
	groupId: string;
	authorId: string;
	content: string;
	attachments: VoiceChannelMessageAttachment[];
	isEdited: boolean;
	createdAt: string;
	replyToId?: string | null;
	replyToSnapshot?: ReplyToSnapshot | null;
	forwardedFrom?: ForwardedFromSnapshot | null;
	author: {
		id: string;
		username: string;
		displayName: string | null;
		avatarUrl: string | null;
	};
}

export interface VoiceChannelMessageEvent {
	targetUserIds: string[];
	channelId: string;
	groupId: string;
	message: VoiceChannelMessagePayload;
}

export interface VoiceChannelMessageEditedEvent {
	targetUserIds: string[];
	channelId: string;
	groupId: string;
	messageId: string;
	content: string;
	attachments: VoiceChannelMessageAttachment[];
	updatedAt: string;
}

export interface VoiceChannelMessageDeletedEvent {
	targetUserIds: string[];
	channelId: string;
	groupId: string;
	messageId: string;
}

export interface VoiceChannelMessagePinnedEvent {
	targetUserIds: string[];
	channelId: string;
	groupId: string;
	messageId: string;
	pinnedAt: string;
	pinnedBy: string;
}

export interface VoiceChannelMessageUnpinnedEvent {
	targetUserIds: string[];
	channelId: string;
	groupId: string;
	messageId: string;
}

export interface VoiceChannelMessageReactionUpdatedEvent {
	targetUserIds: string[];
	channelId: string;
	groupId: string;
	messageId: string;
	messageAuthorId: string;
	reactions: DmReactionSummary[];
}

export interface VoiceChannelReadEvent {
	targetUserIds: string[];
	channelId: string;
	groupId: string;
	userId: string;
	lastReadAt: string;
}
