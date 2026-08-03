import { ensureConsumer, SUBJECTS, type DmMessageEvent, type DmMessageEditedEvent, type DmMessageDeletedEvent, type DmMessagePinnedEvent, type DmMessageUnpinnedEvent, type DmMessageReactionUpdatedEvent, type DmReadEvent, type FriendEvent, type UserUpdatedEvent,
	type GroupCreatedEvent, type GroupUpdatedEvent, type GroupDeletedEvent,
	type GroupMemberJoinedEvent, type GroupMemberLeftEvent, type GroupMemberRoleChangedEvent,
	type GroupInviteCreatedEvent, type GroupInviteRespondedEvent,
	type GroupMessageEvent, type GroupMessageEditedEvent, type GroupMessageDeletedEvent,
	type GroupMessagePinnedEvent, type GroupMessageUnpinnedEvent, type GroupMessageReactionUpdatedEvent,
	type GroupReadEvent, type VoiceParticipantEvent,
	type VoiceChannelCreatedEvent, type VoiceChannelUpdatedEvent, type VoiceChannelDeletedEvent,
	type VoiceCategoryCreatedEvent, type VoiceCategoryUpdatedEvent, type VoiceCategoryDeletedEvent,
	type VoiceChannelMessageEvent, type VoiceChannelMessageEditedEvent, type VoiceChannelMessageDeletedEvent,
	type VoiceChannelMessagePinnedEvent, type VoiceChannelMessageUnpinnedEvent,
	type VoiceChannelMessageReactionUpdatedEvent, type VoiceChannelReadEvent,
	type VoiceRoleCreatedEvent, type VoiceRoleUpdatedEvent, type VoiceRoleDeletedEvent,
	type VoiceRoleMembersChangedEvent, type VoiceChannelAccessChangedEvent,
	type CallRingEvent, type CallSignalEvent,
} from '@echo/shared';
import { sendToUser, setUserPrivacy, addFriendPair, removeFriendPair } from './connections.js';
import { getNatsConnection } from './nats.js';

function fanout(targets: string[], event: Parameters<typeof sendToUser>[1]): void {
	for (const id of targets) sendToUser(id, event);
}

export async function startNatsSubscriber(): Promise<void> {
	const nc = getNatsConnection();
	if (!nc) {
		console.warn('[ws-gateway] NATS not available, event delivery disabled');
		return;
	}

	await ensureConsumer(nc, 'DM_EVENTS', 'ws-gateway');
	await ensureConsumer(nc, 'FRIEND_EVENTS', 'ws-gateway-friends');
	await ensureConsumer(nc, 'USERS', 'ws-gateway-users');
	await ensureConsumer(nc, 'GROUP_EVENTS', 'ws-gateway-groups');
	await ensureConsumer(nc, 'VOICE_EVENTS', 'ws-gateway-voice');

	const js = nc.jetstream();

	// DM events
	const dmConsumer = await js.consumers.get('DM_EVENTS', 'ws-gateway');
	(async () => {
		for await (const msg of await dmConsumer.consume()) {
			try {
				if (msg.subject === SUBJECTS.DM_MESSAGE) {
					const event: DmMessageEvent = JSON.parse(msg.string());
					console.log('[ws-gateway] dm relay forwardedFrom:', JSON.stringify((event.message as any).forwardedFrom));
					sendToUser(event.targetUserId, {
						type: 'dm',
						chatId: event.chatId,
						message: event.message,
						unreadCount: event.unreadCount,
					});
				} else if (msg.subject === SUBJECTS.DM_MESSAGE_EDITED) {
					const event: DmMessageEditedEvent = JSON.parse(msg.string());
					sendToUser(event.targetUserId, {
						type: 'dm_edited',
						chatId: event.chatId,
						messageId: event.messageId,
						content: event.content,
						attachments: event.attachments,
						updatedAt: event.updatedAt,
					});
				} else if (msg.subject === SUBJECTS.DM_MESSAGE_DELETED) {
					const event: DmMessageDeletedEvent = JSON.parse(msg.string());
					sendToUser(event.targetUserId, {
						type: 'dm_deleted',
						chatId: event.chatId,
						messageId: event.messageId,
					});
				} else if (msg.subject === SUBJECTS.DM_MESSAGE_PINNED) {
					const event: DmMessagePinnedEvent = JSON.parse(msg.string());
					sendToUser(event.targetUserId, {
						type: 'dm_pinned',
						chatId: event.chatId,
						messageId: event.messageId,
						pinnedAt: event.pinnedAt,
						pinnedBy: event.pinnedBy,
					});
				} else if (msg.subject === SUBJECTS.DM_MESSAGE_UNPINNED) {
					const event: DmMessageUnpinnedEvent = JSON.parse(msg.string());
					sendToUser(event.targetUserId, {
						type: 'dm_unpinned',
						chatId: event.chatId,
						messageId: event.messageId,
					});
				} else if (msg.subject === SUBJECTS.DM_MESSAGE_REACTION) {
					const event: DmMessageReactionUpdatedEvent = JSON.parse(msg.string());
					sendToUser(event.targetUserId, {
						type: 'dm_reaction',
						chatId: event.chatId,
						messageId: event.messageId,
						messageAuthorId: event.messageAuthorId,
						reactions: event.reactions,
					});
				} else if (msg.subject === SUBJECTS.DM_READ) {
					const event: DmReadEvent = JSON.parse(msg.string());
					sendToUser(event.targetUserId, {
						type: 'chat_read',
						chatId: event.chatId,
						userId: event.userId,
						lastReadAt: event.lastReadAt,
					});
				}
				msg.ack();
			} catch (err) {
				console.error('[ws-gateway] Error processing DM event:', err);
				msg.nak();
			}
		}
	})();

	// Friend events
	const friendConsumer = await js.consumers.get('FRIEND_EVENTS', 'ws-gateway-friends');
	(async () => {
		for await (const msg of await friendConsumer.consume()) {
			try {
				if (msg.subject === SUBJECTS.FRIEND_EVENT) {
					const event: FriendEvent = JSON.parse(msg.string());
					sendToUser(event.toUserId, {
						type: event.type,
						fromUserId: event.fromUserId,
					});
					sendToUser(event.fromUserId, {
						type: event.type,
						fromUserId: event.toUserId,
					});

					// Update friends cache
					if (event.type === 'friend_accepted') {
						addFriendPair(event.fromUserId, event.toUserId);
					} else if (event.type === 'friend_removed') {
						removeFriendPair(event.fromUserId, event.toUserId);
					}
				}
				msg.ack();
			} catch (err) {
				console.error('[ws-gateway] Error processing friend event:', err);
				msg.nak();
			}
		}
	})();

	// User events (privacy changes)
	const usersConsumer = await js.consumers.get('USERS', 'ws-gateway-users');
	(async () => {
		for await (const msg of await usersConsumer.consume()) {
			try {
				if (msg.subject === SUBJECTS.USER_UPDATED) {
					const event: UserUpdatedEvent = JSON.parse(msg.string());
					if (event.privacyOnlineStatus) {
						setUserPrivacy(event.id, event.privacyOnlineStatus);
					}
				}
				msg.ack();
			} catch (err) {
				console.error('[ws-gateway] Error processing user event:', err);
				msg.nak();
			}
		}
	})();

	// Group events
	const groupConsumer = await js.consumers.get('GROUP_EVENTS', 'ws-gateway-groups');
	(async () => {
		for await (const msg of await groupConsumer.consume()) {
			try {
				switch (msg.subject) {
					case SUBJECTS.GROUP_CREATED: {
						const e: GroupCreatedEvent = JSON.parse(msg.string());
						fanout(e.targetUserIds, { type: 'group_created', group: { ...e.group }, memberIds: e.memberIds });
						break;
					}
					case SUBJECTS.GROUP_UPDATED: {
						const e: GroupUpdatedEvent = JSON.parse(msg.string());
						fanout(e.targetUserIds, { type: 'group_updated', groupId: e.groupId, patch: e.patch as any });
						break;
					}
					case SUBJECTS.GROUP_DELETED: {
						const e: GroupDeletedEvent = JSON.parse(msg.string());
						fanout(e.targetUserIds, { type: 'group_deleted', groupId: e.groupId });
						break;
					}
					case SUBJECTS.GROUP_MEMBER_JOINED: {
						const e: GroupMemberJoinedEvent = JSON.parse(msg.string());
						fanout(e.targetUserIds, { type: 'group_member_joined', groupId: e.groupId, member: e.member });
						break;
					}
					case SUBJECTS.GROUP_MEMBER_LEFT: {
						const e: GroupMemberLeftEvent = JSON.parse(msg.string());
						fanout(e.targetUserIds, { type: 'group_member_left', groupId: e.groupId, userId: e.userId, kicked: e.kicked });
						break;
					}
					case SUBJECTS.GROUP_MEMBER_ROLE_CHANGED: {
						const e: GroupMemberRoleChangedEvent = JSON.parse(msg.string());
						fanout(e.targetUserIds, { type: 'group_member_role', groupId: e.groupId, userId: e.userId, role: e.role });
						break;
					}
					case SUBJECTS.GROUP_INVITE_CREATED: {
						const e: GroupInviteCreatedEvent = JSON.parse(msg.string());
						fanout(e.targetUserIds, { type: 'group_invite_created', invite: e.invite });
						break;
					}
					case SUBJECTS.GROUP_INVITE_RESPONDED: {
						const e: GroupInviteRespondedEvent = JSON.parse(msg.string());
						fanout(e.targetUserIds, { type: 'group_invite_responded', inviteId: e.inviteId, groupId: e.groupId, inviteeId: e.inviteeId, status: e.status });
						break;
					}
					case SUBJECTS.GROUP_MESSAGE: {
						const e: GroupMessageEvent = JSON.parse(msg.string());
						fanout(e.targetUserIds, { type: 'group_message', groupId: e.groupId, message: e.message as any });
						break;
					}
					case SUBJECTS.GROUP_MESSAGE_EDITED: {
						const e: GroupMessageEditedEvent = JSON.parse(msg.string());
						fanout(e.targetUserIds, { type: 'group_message_edited', groupId: e.groupId, messageId: e.messageId, content: e.content, attachments: e.attachments as any, updatedAt: e.updatedAt });
						break;
					}
					case SUBJECTS.GROUP_MESSAGE_DELETED: {
						const e: GroupMessageDeletedEvent = JSON.parse(msg.string());
						fanout(e.targetUserIds, { type: 'group_message_deleted', groupId: e.groupId, messageId: e.messageId });
						break;
					}
					case SUBJECTS.GROUP_MESSAGE_PINNED: {
						const e: GroupMessagePinnedEvent = JSON.parse(msg.string());
						fanout(e.targetUserIds, { type: 'group_message_pinned', groupId: e.groupId, messageId: e.messageId, pinnedAt: e.pinnedAt, pinnedBy: e.pinnedBy });
						break;
					}
					case SUBJECTS.GROUP_MESSAGE_UNPINNED: {
						const e: GroupMessageUnpinnedEvent = JSON.parse(msg.string());
						fanout(e.targetUserIds, { type: 'group_message_unpinned', groupId: e.groupId, messageId: e.messageId });
						break;
					}
					case SUBJECTS.GROUP_MESSAGE_REACTION: {
						const e: GroupMessageReactionUpdatedEvent = JSON.parse(msg.string());
						fanout(e.targetUserIds, { type: 'group_message_reaction', groupId: e.groupId, messageId: e.messageId, reactions: e.reactions });
						break;
					}
					case SUBJECTS.GROUP_READ: {
						const e: GroupReadEvent = JSON.parse(msg.string());
						fanout(e.targetUserIds, { type: 'group_read', groupId: e.groupId, userId: e.userId, lastReadAt: e.lastReadAt });
						break;
					}
				}
				msg.ack();
			} catch (err) {
				console.error('[ws-gateway] Error processing group event:', err);
				msg.nak();
			}
		}
	})();

	// Voice events — fan out join/leave/mute changes so every group member's
	// sidebar updates in real time without polling.
	const voiceConsumer = await js.consumers.get('VOICE_EVENTS', 'ws-gateway-voice');
	(async () => {
		for await (const msg of await voiceConsumer.consume()) {
			try {
				if (msg.subject === SUBJECTS.VOICE_PARTICIPANT) {
					const e: VoiceParticipantEvent = JSON.parse(msg.string());
					fanout(e.targetUserIds, {
						type: 'voice_participant',
						groupId: e.groupId,
						channelId: e.channelId,
						kind: e.kind,
						participant: e.participant,
					});
				} else if (msg.subject === SUBJECTS.VOICE_CHANNEL_CREATED) {
					const e: VoiceChannelCreatedEvent = JSON.parse(msg.string());
					fanout(e.targetUserIds, {
						type: 'voice_channel_created',
						channel: e.channel,
					});
				} else if (msg.subject === SUBJECTS.VOICE_CHANNEL_UPDATED) {
					const e: VoiceChannelUpdatedEvent = JSON.parse(msg.string());
					fanout(e.targetUserIds, {
						type: 'voice_channel_updated',
						groupId: e.groupId,
						channelId: e.channelId,
						patch: e.patch,
					});
				} else if (msg.subject === SUBJECTS.VOICE_CHANNEL_DELETED) {
					const e: VoiceChannelDeletedEvent = JSON.parse(msg.string());
					fanout(e.targetUserIds, {
						type: 'voice_channel_deleted',
						groupId: e.groupId,
						channelId: e.channelId,
					});
				} else if (msg.subject === SUBJECTS.VOICE_CATEGORY_CREATED) {
					const e: VoiceCategoryCreatedEvent = JSON.parse(msg.string());
					fanout(e.targetUserIds, {
						type: 'voice_category_created',
						category: e.category,
					});
				} else if (msg.subject === SUBJECTS.VOICE_CATEGORY_UPDATED) {
					const e: VoiceCategoryUpdatedEvent = JSON.parse(msg.string());
					fanout(e.targetUserIds, {
						type: 'voice_category_updated',
						groupId: e.groupId,
						categoryId: e.categoryId,
						patch: e.patch,
					});
				} else if (msg.subject === SUBJECTS.VOICE_CATEGORY_DELETED) {
					const e: VoiceCategoryDeletedEvent = JSON.parse(msg.string());
					fanout(e.targetUserIds, {
						type: 'voice_category_deleted',
						groupId: e.groupId,
						categoryId: e.categoryId,
					});
				} else if (msg.subject === SUBJECTS.VOICE_CHANNEL_MESSAGE) {
					const e: VoiceChannelMessageEvent = JSON.parse(msg.string());
					fanout(e.targetUserIds, {
						type: 'voice_channel_message',
						channelId: e.channelId,
						groupId: e.groupId,
						message: e.message as any,
					});
				} else if (msg.subject === SUBJECTS.VOICE_CHANNEL_MESSAGE_EDITED) {
					const e: VoiceChannelMessageEditedEvent = JSON.parse(msg.string());
					fanout(e.targetUserIds, {
						type: 'voice_channel_message_edited',
						channelId: e.channelId,
						groupId: e.groupId,
						messageId: e.messageId,
						content: e.content,
						attachments: e.attachments as any,
						updatedAt: e.updatedAt,
					});
				} else if (msg.subject === SUBJECTS.VOICE_CHANNEL_MESSAGE_DELETED) {
					const e: VoiceChannelMessageDeletedEvent = JSON.parse(msg.string());
					fanout(e.targetUserIds, {
						type: 'voice_channel_message_deleted',
						channelId: e.channelId,
						groupId: e.groupId,
						messageId: e.messageId,
					});
				} else if (msg.subject === SUBJECTS.VOICE_CHANNEL_MESSAGE_PINNED) {
					const e: VoiceChannelMessagePinnedEvent = JSON.parse(msg.string());
					fanout(e.targetUserIds, {
						type: 'voice_channel_message_pinned',
						channelId: e.channelId,
						groupId: e.groupId,
						messageId: e.messageId,
						pinnedAt: e.pinnedAt,
						pinnedBy: e.pinnedBy,
					});
				} else if (msg.subject === SUBJECTS.VOICE_CHANNEL_MESSAGE_UNPINNED) {
					const e: VoiceChannelMessageUnpinnedEvent = JSON.parse(msg.string());
					fanout(e.targetUserIds, {
						type: 'voice_channel_message_unpinned',
						channelId: e.channelId,
						groupId: e.groupId,
						messageId: e.messageId,
					});
				} else if (msg.subject === SUBJECTS.VOICE_CHANNEL_MESSAGE_REACTION) {
					const e: VoiceChannelMessageReactionUpdatedEvent = JSON.parse(msg.string());
					fanout(e.targetUserIds, {
						type: 'voice_channel_message_reaction',
						channelId: e.channelId,
						groupId: e.groupId,
						messageId: e.messageId,
						reactions: e.reactions,
					});
				} else if (msg.subject === SUBJECTS.VOICE_CHANNEL_READ) {
					const e: VoiceChannelReadEvent = JSON.parse(msg.string());
					fanout(e.targetUserIds, {
						type: 'voice_channel_read',
						channelId: e.channelId,
						groupId: e.groupId,
						userId: e.userId,
						lastReadAt: e.lastReadAt,
					});
				} else if (msg.subject === SUBJECTS.VOICE_ROLE_CREATED) {
					const e: VoiceRoleCreatedEvent = JSON.parse(msg.string());
					fanout(e.targetUserIds, {
						type: 'voice_role_created',
						role: e.role,
					});
				} else if (msg.subject === SUBJECTS.VOICE_ROLE_UPDATED) {
					const e: VoiceRoleUpdatedEvent = JSON.parse(msg.string());
					fanout(e.targetUserIds, {
						type: 'voice_role_updated',
						groupId: e.groupId,
						roleId: e.roleId,
						patch: e.patch,
					});
				} else if (msg.subject === SUBJECTS.VOICE_ROLE_DELETED) {
					const e: VoiceRoleDeletedEvent = JSON.parse(msg.string());
					fanout(e.targetUserIds, {
						type: 'voice_role_deleted',
						groupId: e.groupId,
						roleId: e.roleId,
					});
				} else if (msg.subject === SUBJECTS.VOICE_ROLE_MEMBERS_CHANGED) {
					const e: VoiceRoleMembersChangedEvent = JSON.parse(msg.string());
					fanout(e.targetUserIds, {
						type: 'voice_role_members_changed',
						groupId: e.groupId,
						roleId: e.roleId,
						kind: e.kind,
						userId: e.userId,
					});
				} else if (msg.subject === SUBJECTS.VOICE_CHANNEL_ACCESS_CHANGED) {
					const e: VoiceChannelAccessChangedEvent = JSON.parse(msg.string());
					fanout(e.targetUserIds, {
						type: 'voice_channel_access_changed',
						groupId: e.groupId,
						channelId: e.channelId,
						roleIds: e.roleIds,
					});
				} else if (msg.subject === SUBJECTS.CALL_RING) {
					const e: CallRingEvent = JSON.parse(msg.string());
					sendToUser(e.targetUserId, {
						type: 'call_ring',
						roomName: e.roomName,
						from: e.from,
						video: e.video,
					});
				} else if (msg.subject === SUBJECTS.CALL_ACCEPTED) {
					const e: CallSignalEvent = JSON.parse(msg.string());
					sendToUser(e.targetUserId, { type: 'call_accepted', roomName: e.roomName, fromUserId: e.fromUserId });
				} else if (msg.subject === SUBJECTS.CALL_DECLINED) {
					const e: CallSignalEvent = JSON.parse(msg.string());
					sendToUser(e.targetUserId, { type: 'call_declined', roomName: e.roomName, fromUserId: e.fromUserId });
				} else if (msg.subject === SUBJECTS.CALL_CANCELLED) {
					const e: CallSignalEvent = JSON.parse(msg.string());
					sendToUser(e.targetUserId, { type: 'call_cancelled', roomName: e.roomName, fromUserId: e.fromUserId });
				} else if (msg.subject === SUBJECTS.CALL_ENDED) {
					const e: CallSignalEvent = JSON.parse(msg.string());
					sendToUser(e.targetUserId, { type: 'call_ended', roomName: e.roomName, fromUserId: e.fromUserId });
				}
				msg.ack();
			} catch (err) {
				console.error('[ws-gateway] Error processing voice event:', err);
				msg.nak();
			}
		}
	})();

	console.log('[ws-gateway] NATS event subscribers active');
}
