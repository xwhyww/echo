import { eq } from 'drizzle-orm';
import {
	createNatsConnection, setupStreams, ensureConsumer, SUBJECTS,
	type NatsConnection, type UserCreatedEvent, type UserUpdatedEvent, type PresenceEvent,
} from '@echo/shared';
import type { Database } from './db/index.js';
import { userProfiles } from './db/schema.js';

let nc: NatsConnection | null = null;

export async function initNats(url: string, db: Database): Promise<void> {
	nc = await createNatsConnection(url);
	await setupStreams(nc);
	await ensureConsumer(nc, 'USERS', 'user-service');

	const js = nc.jetstream();
	const consumer = await js.consumers.get('USERS', 'user-service');

	// Process user events (JetStream durable)
	(async () => {
		for await (const msg of await consumer.consume()) {
			try {
				if (msg.subject === SUBJECTS.USER_CREATED) {
					const event: UserCreatedEvent = JSON.parse(msg.string());
					await db.insert(userProfiles).values({
						id: event.id,
						email: event.email,
						username: event.username,
						displayName: event.displayName,
						avatarUrl: event.avatarUrl,
						phone: event.phone,
					}).onConflictDoNothing();
				} else if (msg.subject === SUBJECTS.USER_UPDATED) {
					const event: UserUpdatedEvent = JSON.parse(msg.string());
					const updates: Record<string, unknown> = { updatedAt: new Date() };
					if (event.username !== undefined) updates.username = event.username;
					if (event.email !== undefined) updates.email = event.email;
					if (event.displayName !== undefined) updates.displayName = event.displayName;
					if (event.avatarUrl !== undefined) updates.avatarUrl = event.avatarUrl;
					if (event.phone !== undefined) updates.phone = event.phone;
					if (event.status !== undefined) updates.status = event.status;
					if (event.privacyOnlineStatus !== undefined) updates.privacyOnlineStatus = event.privacyOnlineStatus;
					if (event.privacyPhone !== undefined) updates.privacyPhone = event.privacyPhone;
					if (event.privacyEmail !== undefined) updates.privacyEmail = event.privacyEmail;
					if (event.privacyMessaging !== undefined) updates.privacyMessaging = event.privacyMessaging;
					if (event.privacyProfile !== undefined) updates.privacyProfile = event.privacyProfile;
					if (event.privacyPhoto !== undefined) updates.privacyPhoto = event.privacyPhoto;
					if (event.privacyGroupInvite !== undefined) updates.privacyGroupInvite = event.privacyGroupInvite;
					await db.update(userProfiles).set(updates).where(eq(userProfiles.id, event.id));
				}
				msg.ack();
			} catch (err) {
				console.error('[user-service] Error processing user event:', err);
				msg.nak();
			}
		}
	})();

	// Process presence events (plain NATS, ephemeral)
	const presenceSub = nc.subscribe('echo.presence.*');
	(async () => {
		for await (const msg of presenceSub) {
			try {
				const event: PresenceEvent = JSON.parse(msg.string());
				await db.update(userProfiles)
					.set({ isOnline: event.online, updatedAt: new Date() })
					.where(eq(userProfiles.id, event.userId));
			} catch (err) {
				console.error('[user-service] Error processing presence:', err);
			}
		}
	})();

	console.log('[user-service] Connected to NATS, subscriptions active');
}

export function getNatsConnection(): NatsConnection | null {
	return nc;
}
