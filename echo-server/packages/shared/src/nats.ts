import { connect, AckPolicy, DeliverPolicy, type NatsConnection, type JetStreamManager, type JetStreamClient, type ConsumerConfig } from 'nats';

export type { NatsConnection } from 'nats';

export async function createNatsConnection(url: string): Promise<NatsConnection> {
	return connect({ servers: url });
}

export async function getJetStream(nc: NatsConnection): Promise<JetStreamClient> {
	return nc.jetstream();
}

export async function setupStreams(nc: NatsConnection): Promise<void> {
	const jsm = await nc.jetstreamManager();

	await ensureStream(jsm, 'USERS', ['echo.users.>']);
	await ensureStream(jsm, 'DM_EVENTS', ['echo.dm.>']);
	await ensureStream(jsm, 'FRIEND_EVENTS', ['echo.friends.>']);
	await ensureStream(jsm, 'CHATS', ['echo.chats.>']);
	await ensureStream(jsm, 'GROUP_EVENTS', ['echo.groups.>']);
	await ensureStream(jsm, 'VOICE_EVENTS', ['echo.voice.>']);
}

export async function ensureConsumer(nc: NatsConnection, stream: string, name: string, filterSubjects?: string[]): Promise<void> {
	const jsm = await nc.jetstreamManager();
	try {
		await jsm.consumers.info(stream, name);
	} catch {
		const config: Partial<ConsumerConfig> = {
			durable_name: name,
			ack_policy: AckPolicy.Explicit,
			deliver_policy: DeliverPolicy.New,
		};
		if (filterSubjects && filterSubjects.length > 0) {
			if (filterSubjects.length === 1) {
				config.filter_subject = filterSubjects[0];
			} else {
				config.filter_subjects = filterSubjects;
			}
		}
		await jsm.consumers.add(stream, config);
	}
}

async function ensureStream(jsm: JetStreamManager, name: string, subjects: string[]): Promise<void> {
	try {
		await jsm.streams.info(name);
	} catch {
		await jsm.streams.add({ name, subjects });
	}
}

export const SUBJECTS = {
	USER_CREATED: 'echo.users.created',
	USER_UPDATED: 'echo.users.updated',
	PRESENCE_ONLINE: 'echo.presence.online',
	PRESENCE_OFFLINE: 'echo.presence.offline',
	DM_MESSAGE: 'echo.dm.message',
	DM_MESSAGE_EDITED: 'echo.dm.message.edited',
	DM_MESSAGE_DELETED: 'echo.dm.message.deleted',
	DM_MESSAGE_PINNED: 'echo.dm.message.pinned',
	DM_MESSAGE_UNPINNED: 'echo.dm.message.unpinned',
	DM_MESSAGE_REACTION: 'echo.dm.message.reaction',
	DM_READ: 'echo.dm.read',
	FRIEND_EVENT: 'echo.friends.event',
	TYPING_DM: 'echo.typing.dm',
	TYPING_CHANNEL: 'echo.typing.channel',
	DM_CHAT_CREATED: 'echo.chats.dm.created',
	DM_CHAT_DELETED: 'echo.chats.dm.deleted',
	GROUP_CREATED: 'echo.groups.created',
	GROUP_UPDATED: 'echo.groups.updated',
	GROUP_DELETED: 'echo.groups.deleted',
	GROUP_MEMBER_JOINED: 'echo.groups.member.joined',
	GROUP_MEMBER_LEFT: 'echo.groups.member.left',
	GROUP_MEMBER_ROLE_CHANGED: 'echo.groups.member.role',
	GROUP_INVITE_CREATED: 'echo.groups.invite.created',
	GROUP_INVITE_RESPONDED: 'echo.groups.invite.responded',
	GROUP_MESSAGE: 'echo.groups.message',
	GROUP_MESSAGE_EDITED: 'echo.groups.message.edited',
	GROUP_MESSAGE_DELETED: 'echo.groups.message.deleted',
	GROUP_MESSAGE_PINNED: 'echo.groups.message.pinned',
	GROUP_MESSAGE_UNPINNED: 'echo.groups.message.unpinned',
	GROUP_MESSAGE_REACTION: 'echo.groups.message.reaction',
	GROUP_READ: 'echo.groups.read',
	VOICE_PARTICIPANT: 'echo.voice.participant',
	VOICE_CHANNEL_CREATED: 'echo.voice.channel.created',
	VOICE_CHANNEL_UPDATED: 'echo.voice.channel.updated',
	VOICE_CHANNEL_DELETED: 'echo.voice.channel.deleted',
	VOICE_CATEGORY_CREATED: 'echo.voice.category.created',
	VOICE_CATEGORY_UPDATED: 'echo.voice.category.updated',
	VOICE_CATEGORY_DELETED: 'echo.voice.category.deleted',
	VOICE_CHANNEL_MESSAGE: 'echo.voice.channel.message',
	VOICE_CHANNEL_MESSAGE_EDITED: 'echo.voice.channel.message.edited',
	VOICE_CHANNEL_MESSAGE_DELETED: 'echo.voice.channel.message.deleted',
	VOICE_CHANNEL_MESSAGE_PINNED: 'echo.voice.channel.message.pinned',
	VOICE_CHANNEL_MESSAGE_UNPINNED: 'echo.voice.channel.message.unpinned',
	VOICE_CHANNEL_MESSAGE_REACTION: 'echo.voice.channel.message.reaction',
	VOICE_CHANNEL_READ: 'echo.voice.channel.read',
	VOICE_ROLE_CREATED: 'echo.voice.role.created',
	VOICE_ROLE_UPDATED: 'echo.voice.role.updated',
	VOICE_ROLE_DELETED: 'echo.voice.role.deleted',
	VOICE_ROLE_MEMBERS_CHANGED: 'echo.voice.role.members',
	VOICE_CHANNEL_ACCESS_CHANGED: 'echo.voice.channel.access',
	// 1-to-1 DM calls. These flow through the VOICE_EVENTS stream (echo.voice.>)
	// so the existing ws-gateway voice consumer picks them up without new
	// consumer config. Each is targeted at a single user (see CallRingEvent /
	// CallSignalEvent), mirroring the DM event fan-out style.
	CALL_RING: 'echo.voice.call.ring',
	CALL_ACCEPTED: 'echo.voice.call.accepted',
	CALL_DECLINED: 'echo.voice.call.declined',
	CALL_CANCELLED: 'echo.voice.call.cancelled',
	CALL_ENDED: 'echo.voice.call.ended',
} as const;
