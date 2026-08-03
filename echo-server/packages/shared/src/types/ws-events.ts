export type WsEvent =
	| { type: 'dm'; chatId: string; message: DmMessagePayload; unreadCount?: number }
	| { type: 'channel_message'; channelId: string; message: ChannelMessagePayload }
	| { type: 'typing'; chatId: string; userId: string; username: string }
	| { type: 'typing_channel'; channelId: string; userId: string; username: string }
	| { type: 'presence'; userId: string; online: boolean }
	| { type: 'dm_edited'; chatId: string; messageId: string; content: string; attachments: DmMessageAttachment[]; updatedAt: string }
	| { type: 'dm_deleted'; chatId: string; messageId: string }
	| { type: 'dm_pinned'; chatId: string; messageId: string; pinnedAt: string; pinnedBy: string }
	| { type: 'dm_unpinned'; chatId: string; messageId: string }
	| { type: 'dm_reaction'; chatId: string; messageId: string; reactions: DmReactionSummaryPayload[] }
	| { type: 'chat_read'; chatId: string; userId: string; lastReadAt: string }
	| { type: 'friend_request'; fromUserId: string }
	| { type: 'friend_accepted'; fromUserId: string }
	| { type: 'friend_removed'; fromUserId: string }
	| { type: 'group_message'; groupId: string; message: GroupMessageWsPayload }
	| { type: 'group_message_edited'; groupId: string; messageId: string; content: string; attachments: GroupMessageWsAttachment[]; updatedAt: string }
	| { type: 'group_message_deleted'; groupId: string; messageId: string }
	| { type: 'group_message_pinned'; groupId: string; messageId: string; pinnedAt: string; pinnedBy: string }
	| { type: 'group_message_unpinned'; groupId: string; messageId: string }
	| { type: 'group_message_reaction'; groupId: string; messageId: string; reactions: DmReactionSummaryPayload[] }
	| { type: 'group_read'; groupId: string; userId: string; lastReadAt: string }
	| { type: 'group_created'; group: GroupWsSummary; memberIds: string[] }
	| { type: 'group_updated'; groupId: string; patch: Partial<GroupWsSummary> }
	| { type: 'group_deleted'; groupId: string }
	| { type: 'group_member_joined'; groupId: string; member: GroupMemberWsSummary }
	| { type: 'group_member_left'; groupId: string; userId: string; kicked: boolean }
	| { type: 'group_member_role'; groupId: string; userId: string; role: 'owner' | 'admin' | 'member' }
	| { type: 'group_invite_created'; invite: GroupInviteWsPayload }
	| { type: 'group_invite_responded'; inviteId: string; groupId: string; inviteeId: string; status: 'accepted' | 'declined' | 'revoked' }
	| { type: 'voice_participant'; groupId: string; channelId: string; kind: 'joined' | 'left' | 'updated'; participant: VoiceParticipantWsPayload }
	| { type: 'voice_channel_created'; channel: VoiceChannelWsPayload }
	| { type: 'voice_channel_updated'; groupId: string; channelId: string; patch: { name?: string; categoryId?: string | null } }
	| { type: 'voice_channel_deleted'; groupId: string; channelId: string }
	| { type: 'voice_category_created'; category: VoiceCategoryWsPayload }
	| { type: 'voice_category_updated'; groupId: string; categoryId: string; patch: { name?: string; position?: number } }
	| { type: 'voice_category_deleted'; groupId: string; categoryId: string }
	| { type: 'voice_channel_message'; channelId: string; groupId: string; message: VoiceChannelMessageWsPayload }
	| { type: 'voice_channel_message_edited'; channelId: string; groupId: string; messageId: string; content: string; attachments: VoiceChannelMessageWsAttachment[]; updatedAt: string }
	| { type: 'voice_channel_message_deleted'; channelId: string; groupId: string; messageId: string }
	| { type: 'voice_channel_message_pinned'; channelId: string; groupId: string; messageId: string; pinnedAt: string; pinnedBy: string }
	| { type: 'voice_channel_message_unpinned'; channelId: string; groupId: string; messageId: string }
	| { type: 'voice_channel_message_reaction'; channelId: string; groupId: string; messageId: string; reactions: DmReactionSummaryPayload[] }
	| { type: 'voice_channel_read'; channelId: string; groupId: string; userId: string; lastReadAt: string }
	| { type: 'voice_role_created'; role: VoiceRoleWsPayload }
	| { type: 'voice_role_updated'; groupId: string; roleId: string; patch: { name?: string; color?: string | null; permissions?: number; position?: number } }
	| { type: 'voice_role_deleted'; groupId: string; roleId: string }
	| { type: 'voice_role_members_changed'; groupId: string; roleId: string; kind: 'added' | 'removed'; userId: string }
	| { type: 'voice_channel_access_changed'; groupId: string; channelId: string; roleIds: string[] }
	| { type: 'call_ring'; roomName: string; from: CallPartyWsPayload; video: boolean }
	| { type: 'call_accepted'; roomName: string; fromUserId: string }
	| { type: 'call_declined'; roomName: string; fromUserId: string }
	| { type: 'call_cancelled'; roomName: string; fromUserId: string }
	| { type: 'call_ended'; roomName: string; fromUserId: string }
	| { type: 'error'; message: string };

export interface CallPartyWsPayload {
	id: string;
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
}

export interface VoiceRoleWsPayload {
	id: string;
	groupId: string;
	name: string;
	color: string | null;
	permissions: number;
	position: number;
	createdBy: string;
	createdAt: string;
}

export interface VoiceChannelMessageWsAttachment {
	id: string;
	url: string;
	filename: string;
	mimeType: string;
	size: number;
	hash?: string;
	thumbUrl?: string | null;
}

export interface VoiceChannelMessageWsPayload {
	id: string;
	channelId: string;
	groupId: string;
	authorId: string;
	content: string;
	attachments: VoiceChannelMessageWsAttachment[];
	isEdited: boolean;
	createdAt: string;
	replyToId?: string | null;
	replyToSnapshot?: {
		authorId: string;
		authorName: string;
		content: string;
		attachmentType?: string | null;
	} | null;
	author: {
		id: string;
		username: string;
		displayName: string | null;
		avatarUrl: string | null;
	};
}

export interface VoiceChannelWsPayload {
	id: string;
	groupId: string;
	categoryId: string | null;
	name: string;
	createdBy: string;
	createdAt: string;
}

export interface VoiceCategoryWsPayload {
	id: string;
	groupId: string;
	name: string;
	position: number;
	createdBy: string;
	createdAt: string;
}

export interface VoiceParticipantWsPayload {
	userId: string;
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
	micMuted: boolean;
	deafened: boolean;
	sharing: boolean;
}

export interface GroupWsSummary {
	id: string;
	name: string;
	description: string | null;
	avatarUrl: string | null;
	ownerId: string;
	isPublic: boolean;
	createdAt: string;
}

export interface GroupMemberWsSummary {
	userId: string;
	role: 'owner' | 'admin' | 'member';
	nickname: string | null;
	joinedAt: string;
	user: {
		id: string;
		username: string;
		displayName: string | null;
		avatarUrl: string | null;
	};
}

export interface GroupMessageWsAttachment {
	id: string;
	url: string;
	filename: string;
	mimeType: string;
	size: number;
	hash?: string;
	thumbUrl?: string | null;
}

export interface GroupMessageWsPayload {
	id: string;
	groupId: string;
	authorId: string;
	content: string;
	attachments: GroupMessageWsAttachment[];
	isEdited: boolean;
	createdAt: string;
	systemKind?: string | null;
	replyToId?: string | null;
	replyToSnapshot?: {
		authorId: string;
		authorName: string;
		content: string;
		attachmentType?: string | null;
	} | null;
	author: {
		id: string;
		username: string;
		displayName: string | null;
		avatarUrl: string | null;
	};
}

export interface GroupInviteWsPayload {
	id: string;
	groupId: string;
	groupName: string;
	groupAvatarUrl: string | null;
	inviterId: string;
	inviterUsername: string;
	createdAt: string;
}

export interface DmReactionSummaryPayload {
	emoji: string;
	count: number;
	userIds: string[];
	reactedAts: string[];
}

export interface DmMessageAttachment {
	id: string;
	url: string;
	filename: string;
	mimeType: string;
	size: number;
}

export interface DmMessagePayload {
	id: string;
	chatId: string;
	authorId: string;
	content: string;
	attachments: DmMessageAttachment[];
	isEdited: boolean;
	createdAt: string;
	replyToId?: string | null;
	replyToSnapshot?: {
		authorId: string;
		authorName: string;
		content: string;
		attachmentType?: string | null;
	} | null;
	author: {
		id: string;
		username: string;
		displayName: string | null;
		avatarUrl: string | null;
	};
}

export interface ChannelMessagePayload {
	id: string;
	content: string;
	fileUrl: string | null;
	authorId: string;
	channelId: string;
	isEdited: boolean;
	createdAt: string;
	author: {
		id: string;
		username: string;
		displayName: string | null;
		avatarUrl: string | null;
	};
}

export interface IncomingWsMessage {
	type: string;
	chatId?: string;
	channelId?: string;
}
