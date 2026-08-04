import { eq } from 'drizzle-orm';
import {
	createNatsConnection, setupStreams, ensureConsumer, getJetStream, SUBJECTS,
	type NatsConnection, type UserCreatedEvent, type UserUpdatedEvent, type PresenceEvent,
	type GroupCreatedEvent, type GroupUpdatedEvent, type GroupDeletedEvent,
	type GroupMemberJoinedEvent, type GroupMemberLeftEvent, type GroupMemberRoleChangedEvent,
	type GroupInviteCreatedEvent, type GroupInviteRespondedEvent,
	type GroupMessageEvent, type GroupMessageEditedEvent, type GroupMessageDeletedEvent,
	type GroupMessagePinnedEvent, type GroupMessageUnpinnedEvent, type GroupMessageReactionUpdatedEvent,
	type GroupReadEvent,
} from '@echo/shared';
import type { Database } from './db/index.js';
import { userCache } from './db/schema.js';
import { log } from './log.js';

let nc: NatsConnection | null = null;

export async function initNats(url: string, db: Database): Promise<void> {
	nc = await createNatsConnection(url);
	await setupStreams(nc);
	await ensureConsumer(nc, 'USERS', 'groups-service');
	const js = nc.jetstream();
	const consumer = await js.consumers.get('USERS', 'groups-service');

	(async () => {
		for await (const msg of await consumer.consume()) {
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
					if (event.privacyOnlineStatus !== undefined) updates.privacyOnlineStatus = event.privacyOnlineStatus;
					if (event.privacyMessaging !== undefined) updates.privacyMessaging = event.privacyMessaging;
					if (event.privacyPhoto !== undefined) updates.privacyPhoto = event.privacyPhoto;
					if (event.privacyGroupInvite !== undefined) updates.privacyGroupInvite = event.privacyGroupInvite;
					await db.update(userCache).set(updates).where(eq(userCache.id, event.id));
				}
				msg.ack();
			} catch (err) {
				log.error({ err }, 'Error processing user event');
				msg.nak();
			}
		}
	})();

	const presenceSub = nc.subscribe('echo.presence.*');
	(async () => {
		for await (const msg of presenceSub) {
			try {
				const event: PresenceEvent = JSON.parse(msg.string());
				await db.update(userCache)
					.set({ isOnline: event.online, updatedAt: new Date() })
					.where(eq(userCache.id, event.userId));
			} catch (err) {
				log.error({ err }, 'Error processing presence');
			}
		}
	})();

	log.info('Connected to NATS, subscriptions active');
}

async function publish(subject: string, data: unknown): Promise<void> {
	if (!nc) return;
	const js = await getJetStream(nc);
	await js.publish(subject, JSON.stringify(data));
}

export const publishGroupCreated = (e: GroupCreatedEvent) => publish(SUBJECTS.GROUP_CREATED, e);
export const publishGroupUpdated = (e: GroupUpdatedEvent) => publish(SUBJECTS.GROUP_UPDATED, e);
export const publishGroupDeleted = (e: GroupDeletedEvent) => publish(SUBJECTS.GROUP_DELETED, e);
export const publishGroupMemberJoined = (e: GroupMemberJoinedEvent) => publish(SUBJECTS.GROUP_MEMBER_JOINED, e);
export const publishGroupMemberLeft = (e: GroupMemberLeftEvent) => publish(SUBJECTS.GROUP_MEMBER_LEFT, e);
export const publishGroupMemberRoleChanged = (e: GroupMemberRoleChangedEvent) => publish(SUBJECTS.GROUP_MEMBER_ROLE_CHANGED, e);
export const publishGroupInviteCreated = (e: GroupInviteCreatedEvent) => publish(SUBJECTS.GROUP_INVITE_CREATED, e);
export const publishGroupInviteResponded = (e: GroupInviteRespondedEvent) => publish(SUBJECTS.GROUP_INVITE_RESPONDED, e);
export const publishGroupMessage = (e: GroupMessageEvent) => publish(SUBJECTS.GROUP_MESSAGE, e);
export const publishGroupMessageEdited = (e: GroupMessageEditedEvent) => publish(SUBJECTS.GROUP_MESSAGE_EDITED, e);
export const publishGroupMessageDeleted = (e: GroupMessageDeletedEvent) => publish(SUBJECTS.GROUP_MESSAGE_DELETED, e);
export const publishGroupMessagePinned = (e: GroupMessagePinnedEvent) => publish(SUBJECTS.GROUP_MESSAGE_PINNED, e);
export const publishGroupMessageUnpinned = (e: GroupMessageUnpinnedEvent) => publish(SUBJECTS.GROUP_MESSAGE_UNPINNED, e);
export const publishGroupMessageReaction = (e: GroupMessageReactionUpdatedEvent) => publish(SUBJECTS.GROUP_MESSAGE_REACTION, e);
export const publishGroupRead = (e: GroupReadEvent) => publish(SUBJECTS.GROUP_READ, e);
