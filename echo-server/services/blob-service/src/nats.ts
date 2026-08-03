import { and, eq } from 'drizzle-orm';
import {
	createNatsConnection, setupStreams, ensureConsumer, SUBJECTS,
	type NatsConnection, type DmChatCreatedEvent, type DmChatDeletedEvent,
	type GroupCreatedEvent, type GroupDeletedEvent,
	type GroupMemberJoinedEvent, type GroupMemberLeftEvent,
} from '@echo/shared';
import type { Database } from './db/index.js';
import { dmChatMembers, groupMembersMirror, blobGrants } from './db/schema.js';

let nc: NatsConnection | null = null;

export async function initNats(url: string, db: Database): Promise<void> {
	nc = await createNatsConnection(url);
	await setupStreams(nc);
	await ensureConsumer(nc, 'CHATS', 'blob-service', [
		SUBJECTS.DM_CHAT_CREATED,
		SUBJECTS.DM_CHAT_DELETED,
	]);
	await ensureConsumer(nc, 'GROUP_EVENTS', 'blob-service', [
		SUBJECTS.GROUP_CREATED,
		SUBJECTS.GROUP_DELETED,
		SUBJECTS.GROUP_MEMBER_JOINED,
		SUBJECTS.GROUP_MEMBER_LEFT,
	]);

	const js = nc.jetstream();
	const chatsConsumer = await js.consumers.get('CHATS', 'blob-service');
	const groupsConsumer = await js.consumers.get('GROUP_EVENTS', 'blob-service');

	(async () => {
		for await (const msg of await chatsConsumer.consume()) {
			try {
				if (msg.subject === SUBJECTS.DM_CHAT_CREATED) {
					const event: DmChatCreatedEvent = JSON.parse(msg.string());
					if (event.chatId && Array.isArray(event.userIds)) {
						const rows = event.userIds
							.filter((u) => typeof u === 'string' && u.length > 0)
							.map((userId) => ({ chatId: event.chatId, userId }));
						if (rows.length > 0) {
							await db.insert(dmChatMembers).values(rows).onConflictDoNothing();
						}
					}
				} else if (msg.subject === SUBJECTS.DM_CHAT_DELETED) {
					const event: DmChatDeletedEvent = JSON.parse(msg.string());
					if (event.chatId) {
						await db.delete(dmChatMembers).where(eq(dmChatMembers.chatId, event.chatId));
						await db
							.delete(blobGrants)
							.where(and(eq(blobGrants.scopeType, 'chat'), eq(blobGrants.scopeId, event.chatId)));
					}
				}
				msg.ack();
			} catch (err) {
				console.error('[blob-service] Error processing chat event:', err);
				msg.nak();
			}
		}
	})();

	(async () => {
		for await (const msg of await groupsConsumer.consume()) {
			try {
				if (msg.subject === SUBJECTS.GROUP_CREATED) {
					const event: GroupCreatedEvent = JSON.parse(msg.string());
					const groupId = event.group?.id;
					const memberIds = Array.isArray(event.memberIds) ? event.memberIds : [];
					if (groupId && memberIds.length > 0) {
						const rows = memberIds
							.filter((u) => typeof u === 'string' && u.length > 0)
							.map((userId) => ({ groupId, userId }));
						if (rows.length > 0) {
							await db.insert(groupMembersMirror).values(rows).onConflictDoNothing();
						}
					}
				} else if (msg.subject === SUBJECTS.GROUP_MEMBER_JOINED) {
					const event: GroupMemberJoinedEvent = JSON.parse(msg.string());
					if (event.groupId && event.member?.userId) {
						await db.insert(groupMembersMirror)
							.values({ groupId: event.groupId, userId: event.member.userId })
							.onConflictDoNothing();
					}
				} else if (msg.subject === SUBJECTS.GROUP_MEMBER_LEFT) {
					const event: GroupMemberLeftEvent = JSON.parse(msg.string());
					if (event.groupId && event.userId) {
						await db.delete(groupMembersMirror).where(
							and(eq(groupMembersMirror.groupId, event.groupId), eq(groupMembersMirror.userId, event.userId)),
						);
					}
				} else if (msg.subject === SUBJECTS.GROUP_DELETED) {
					const event: GroupDeletedEvent = JSON.parse(msg.string());
					if (event.groupId) {
						await db.delete(groupMembersMirror).where(eq(groupMembersMirror.groupId, event.groupId));
						await db
							.delete(blobGrants)
							.where(and(eq(blobGrants.scopeType, 'group'), eq(blobGrants.scopeId, event.groupId)));
					}
				}
				msg.ack();
			} catch (err) {
				console.error('[blob-service] Error processing group event:', err);
				msg.nak();
			}
		}
	})();

	console.log('[blob-service] Connected to NATS, chat + group subscriptions active');
}

export function getNatsConnection(): NatsConnection | null {
	return nc;
}
