import { eq, and } from 'drizzle-orm';
import {
	createNatsConnection, setupStreams, ensureConsumer, getJetStream, SUBJECTS,
	type NatsConnection,
	type UserCreatedEvent, type UserUpdatedEvent,
	type GroupMemberJoinedEvent, type GroupMemberLeftEvent, type GroupMemberRoleChangedEvent,
	type GroupDeletedEvent,
	type VoiceParticipantEvent,
	type VoiceChannelCreatedEvent, type VoiceChannelUpdatedEvent, type VoiceChannelDeletedEvent,
	type VoiceCategoryCreatedEvent, type VoiceCategoryUpdatedEvent, type VoiceCategoryDeletedEvent,
	type VoiceChannelMessageEvent, type VoiceChannelMessageEditedEvent, type VoiceChannelMessageDeletedEvent,
	type VoiceChannelMessagePinnedEvent, type VoiceChannelMessageUnpinnedEvent,
	type VoiceChannelMessageReactionUpdatedEvent, type VoiceChannelReadEvent,
	type VoiceRoleCreatedEvent, type VoiceRoleUpdatedEvent, type VoiceRoleDeletedEvent,
	type VoiceRoleMembersChangedEvent, type VoiceChannelAccessChangedEvent,
	type CallRingEvent, type CallSignalEvent,
} from '@echo/shared';
import type { Database } from './db/index.js';
import { userCache, groupMembersMirror } from './db/schema.js';
import { log } from './log.js';

let nc: NatsConnection | null = null;

export async function publishVoiceParticipant(e: VoiceParticipantEvent): Promise<void> {
	if (!nc) return;
	const js = await getJetStream(nc);
	await js.publish(SUBJECTS.VOICE_PARTICIPANT, JSON.stringify(e));
}

export async function publishVoiceChannelCreated(e: VoiceChannelCreatedEvent): Promise<void> {
	if (!nc) return;
	const js = await getJetStream(nc);
	await js.publish(SUBJECTS.VOICE_CHANNEL_CREATED, JSON.stringify(e));
}

export async function publishVoiceChannelDeleted(e: VoiceChannelDeletedEvent): Promise<void> {
	if (!nc) return;
	const js = await getJetStream(nc);
	await js.publish(SUBJECTS.VOICE_CHANNEL_DELETED, JSON.stringify(e));
}

export async function publishVoiceChannelUpdated(e: VoiceChannelUpdatedEvent): Promise<void> {
	if (!nc) return;
	const js = await getJetStream(nc);
	await js.publish(SUBJECTS.VOICE_CHANNEL_UPDATED, JSON.stringify(e));
}

export async function publishVoiceCategoryCreated(e: VoiceCategoryCreatedEvent): Promise<void> {
	if (!nc) return;
	const js = await getJetStream(nc);
	await js.publish(SUBJECTS.VOICE_CATEGORY_CREATED, JSON.stringify(e));
}

export async function publishVoiceCategoryUpdated(e: VoiceCategoryUpdatedEvent): Promise<void> {
	if (!nc) return;
	const js = await getJetStream(nc);
	await js.publish(SUBJECTS.VOICE_CATEGORY_UPDATED, JSON.stringify(e));
}

export async function publishVoiceCategoryDeleted(e: VoiceCategoryDeletedEvent): Promise<void> {
	if (!nc) return;
	const js = await getJetStream(nc);
	await js.publish(SUBJECTS.VOICE_CATEGORY_DELETED, JSON.stringify(e));
}

async function publish(subject: string, data: unknown): Promise<void> {
	if (!nc) return;
	const js = await getJetStream(nc);
	await js.publish(subject, JSON.stringify(data));
}

export const publishVoiceChannelMessage = (e: VoiceChannelMessageEvent) =>
	publish(SUBJECTS.VOICE_CHANNEL_MESSAGE, e);
export const publishVoiceChannelMessageEdited = (e: VoiceChannelMessageEditedEvent) =>
	publish(SUBJECTS.VOICE_CHANNEL_MESSAGE_EDITED, e);
export const publishVoiceChannelMessageDeleted = (e: VoiceChannelMessageDeletedEvent) =>
	publish(SUBJECTS.VOICE_CHANNEL_MESSAGE_DELETED, e);
export const publishVoiceChannelMessagePinned = (e: VoiceChannelMessagePinnedEvent) =>
	publish(SUBJECTS.VOICE_CHANNEL_MESSAGE_PINNED, e);
export const publishVoiceChannelMessageUnpinned = (e: VoiceChannelMessageUnpinnedEvent) =>
	publish(SUBJECTS.VOICE_CHANNEL_MESSAGE_UNPINNED, e);
export const publishVoiceChannelMessageReaction = (e: VoiceChannelMessageReactionUpdatedEvent) =>
	publish(SUBJECTS.VOICE_CHANNEL_MESSAGE_REACTION, e);
export const publishVoiceChannelRead = (e: VoiceChannelReadEvent) =>
	publish(SUBJECTS.VOICE_CHANNEL_READ, e);

export const publishVoiceRoleCreated = (e: VoiceRoleCreatedEvent) =>
	publish(SUBJECTS.VOICE_ROLE_CREATED, e);
export const publishVoiceRoleUpdated = (e: VoiceRoleUpdatedEvent) =>
	publish(SUBJECTS.VOICE_ROLE_UPDATED, e);
export const publishVoiceRoleDeleted = (e: VoiceRoleDeletedEvent) =>
	publish(SUBJECTS.VOICE_ROLE_DELETED, e);
export const publishVoiceRoleMembersChanged = (e: VoiceRoleMembersChangedEvent) =>
	publish(SUBJECTS.VOICE_ROLE_MEMBERS_CHANGED, e);
export const publishVoiceChannelAccessChanged = (e: VoiceChannelAccessChangedEvent) =>
	publish(SUBJECTS.VOICE_CHANNEL_ACCESS_CHANGED, e);

// ─── 1-to-1 call signalling ─────────────────────────────────────
export const publishCallRing = (e: CallRingEvent) => publish(SUBJECTS.CALL_RING, e);
export const publishCallAccepted = (e: CallSignalEvent) => publish(SUBJECTS.CALL_ACCEPTED, e);
export const publishCallDeclined = (e: CallSignalEvent) => publish(SUBJECTS.CALL_DECLINED, e);
export const publishCallCancelled = (e: CallSignalEvent) => publish(SUBJECTS.CALL_CANCELLED, e);
export const publishCallEnded = (e: CallSignalEvent) => publish(SUBJECTS.CALL_ENDED, e);

export async function initNats(url: string, db: Database): Promise<void> {
	nc = await createNatsConnection(url);
	await setupStreams(nc);
	await ensureConsumer(nc, 'USERS', 'voice-service');
	await ensureConsumer(nc, 'GROUP_EVENTS', 'voice-service-members', [
		SUBJECTS.GROUP_MEMBER_JOINED,
		SUBJECTS.GROUP_MEMBER_LEFT,
		SUBJECTS.GROUP_MEMBER_ROLE_CHANGED,
		SUBJECTS.GROUP_DELETED,
	]);

	const js = nc.jetstream();

	const usersConsumer = await js.consumers.get('USERS', 'voice-service');
	(async () => {
		for await (const msg of await usersConsumer.consume()) {
			try {
				if (msg.subject === SUBJECTS.USER_CREATED) {
					const event: UserCreatedEvent = JSON.parse(msg.string());
					await db.insert(userCache).values({
						id: event.id,
						username: event.username,
						displayName: event.displayName,
						avatarUrl: event.avatarUrl,
					}).onConflictDoNothing();
				} else if (msg.subject === SUBJECTS.USER_UPDATED) {
					const event: UserUpdatedEvent = JSON.parse(msg.string());
					const updates: Record<string, unknown> = { updatedAt: new Date() };
					if (event.username !== undefined) updates.username = event.username;
					if (event.displayName !== undefined) updates.displayName = event.displayName;
					if (event.avatarUrl !== undefined) updates.avatarUrl = event.avatarUrl;
					await db.update(userCache).set(updates).where(eq(userCache.id, event.id));
				}
				msg.ack();
			} catch (err) {
				log.error({ err }, 'user event');
				msg.nak();
			}
		}
	})();

	const membersConsumer = await js.consumers.get('GROUP_EVENTS', 'voice-service-members');
	(async () => {
		for await (const msg of await membersConsumer.consume()) {
			try {
				if (msg.subject === SUBJECTS.GROUP_MEMBER_JOINED) {
					const event: GroupMemberJoinedEvent = JSON.parse(msg.string());
					await db.insert(groupMembersMirror).values({
						groupId: event.groupId,
						userId: event.member.userId,
						role: event.member.role,
						joinedAt: new Date(event.member.joinedAt),
					}).onConflictDoNothing();
				} else if (msg.subject === SUBJECTS.GROUP_MEMBER_LEFT) {
					const event: GroupMemberLeftEvent = JSON.parse(msg.string());
					await db.delete(groupMembersMirror)
						.where(and(
							eq(groupMembersMirror.groupId, event.groupId),
							eq(groupMembersMirror.userId, event.userId),
						));
				} else if (msg.subject === SUBJECTS.GROUP_MEMBER_ROLE_CHANGED) {
					const event: GroupMemberRoleChangedEvent = JSON.parse(msg.string());
					await db.update(groupMembersMirror)
						.set({ role: event.role })
						.where(and(
							eq(groupMembersMirror.groupId, event.groupId),
							eq(groupMembersMirror.userId, event.userId),
						));
				} else if (msg.subject === SUBJECTS.GROUP_DELETED) {
					const event: GroupDeletedEvent = JSON.parse(msg.string());
					await db.delete(groupMembersMirror)
						.where(eq(groupMembersMirror.groupId, event.groupId));
				}
				msg.ack();
			} catch (err) {
				log.error({ err }, 'group member event');
				msg.nak();
			}
		}
	})();
}
