import { eq } from 'drizzle-orm';
import {
	createNatsConnection, setupStreams, ensureConsumer, getJetStream, SUBJECTS,
	type NatsConnection, type UserCreatedEvent, type UserUpdatedEvent, type PresenceEvent,
	type DmMessageEvent, type DmMessageEditedEvent, type DmMessageDeletedEvent,
	type DmMessagePinnedEvent, type DmMessageUnpinnedEvent, type DmReadEvent,
	type DmChatCreatedEvent, type DmChatDeletedEvent, type DmMessageReactionUpdatedEvent,
} from '@echo/shared';
import type { Database } from './db/index.js';
import { userCache } from './db/schema.js';

let nc: NatsConnection | null = null;

export async function initNats(url: string, db: Database): Promise<void> {
	nc = await createNatsConnection(url);
	await setupStreams(nc);
	await ensureConsumer(nc, 'USERS', 'pers-chats-service');
	const js = nc.jetstream();
	const consumer = await js.consumers.get('USERS', 'pers-chats-service');

	// Process user events for cache hydration (JetStream durable)
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
					await db.update(userCache).set(updates).where(eq(userCache.id, event.id));
				}
				msg.ack();
			} catch (err) {
				console.error('[pers-chats] Error processing user event:', err);
				msg.nak();
			}
		}
	})();

	// Process presence for user cache isOnline (plain NATS)
	const presenceSub = nc.subscribe('echo.presence.*');
	(async () => {
		for await (const msg of presenceSub) {
			try {
				const event: PresenceEvent = JSON.parse(msg.string());
				await db.update(userCache)
					.set({ isOnline: event.online, updatedAt: new Date() })
					.where(eq(userCache.id, event.userId));
			} catch (err) {
				console.error('[pers-chats] Error processing presence:', err);
			}
		}
	})();

	console.log('[pers-chats] Connected to NATS, subscriptions active');
}

export function getNatsConnection(): NatsConnection | null {
	return nc;
}

/** Publish a DM event via NATS JetStream for ws-gateway to deliver */
export async function publishDmEvent(event: DmMessageEvent): Promise<void> {
	if (!nc) return;
	const js = await getJetStream(nc);
	const payload = JSON.stringify(event);
	console.log('[pers-chats] publishDmEvent payload keys:', Object.keys(event.message), 'has forwardedFrom:', 'forwardedFrom' in event.message, 'payload size:', payload.length);
	await js.publish(SUBJECTS.DM_MESSAGE, payload);
}

/** Publish a DM message edited event */
export async function publishDmEditedEvent(event: DmMessageEditedEvent): Promise<void> {
	if (!nc) return;
	const js = await getJetStream(nc);
	await js.publish(SUBJECTS.DM_MESSAGE_EDITED, JSON.stringify(event));
}

/** Publish a DM message deleted event */
export async function publishDmDeletedEvent(event: DmMessageDeletedEvent): Promise<void> {
	if (!nc) return;
	const js = await getJetStream(nc);
	await js.publish(SUBJECTS.DM_MESSAGE_DELETED, JSON.stringify(event));
}

/** Publish a DM message pinned event */
export async function publishDmPinnedEvent(event: DmMessagePinnedEvent): Promise<void> {
	if (!nc) return;
	const js = await getJetStream(nc);
	await js.publish(SUBJECTS.DM_MESSAGE_PINNED, JSON.stringify(event));
}

/** Publish a DM message unpinned event */
export async function publishDmUnpinnedEvent(event: DmMessageUnpinnedEvent): Promise<void> {
	if (!nc) return;
	const js = await getJetStream(nc);
	await js.publish(SUBJECTS.DM_MESSAGE_UNPINNED, JSON.stringify(event));
}

/** Publish a DM message reaction event */
export async function publishDmReactionEvent(event: DmMessageReactionUpdatedEvent): Promise<void> {
	if (!nc) return;
	const js = await getJetStream(nc);
	await js.publish(SUBJECTS.DM_MESSAGE_REACTION, JSON.stringify(event));
}

/** Publish a chat-read event via NATS JetStream for ws-gateway to deliver */
export async function publishDmReadEvent(event: DmReadEvent): Promise<void> {
	if (!nc) return;
	const js = await getJetStream(nc);
	await js.publish(SUBJECTS.DM_READ, JSON.stringify(event));
}

/** Notify blob-service that a new DM chat exists, so it can mirror membership */
export async function publishDmChatCreated(event: DmChatCreatedEvent): Promise<void> {
	if (!nc) return;
	const js = await getJetStream(nc);
	await js.publish(SUBJECTS.DM_CHAT_CREATED, JSON.stringify(event));
}

/** Notify blob-service that a DM chat was deleted, so it can revoke grants */
export async function publishDmChatDeleted(event: DmChatDeletedEvent): Promise<void> {
	if (!nc) return;
	const js = await getJetStream(nc);
	await js.publish(SUBJECTS.DM_CHAT_DELETED, JSON.stringify(event));
}
