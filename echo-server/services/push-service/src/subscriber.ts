import {
	ensureConsumer,
	SUBJECTS,
	type DmMessageEvent,
	type FriendEvent,
	type GroupMessageEvent,
	type GroupInviteCreatedEvent,
} from '@echo/shared';
import { getNatsConnection } from './nats.js';
import { notifyUser, notifyUsers } from './sender.js';
import * as copy from './notifications.js';
import { log } from './log.js';

/**
 * Push is a second reader of the same event streams ws-gateway consumes, under
 * its own durable consumer names. That is the whole integration: ws-gateway is
 * untouched, and the two delivery paths cannot fall out of step because they
 * are fed by the same messages.
 *
 * Only events a person would want to be woken for are handled. Edits, reactions,
 * read receipts, typing, presence and voice-channel churn all stay silent.
 */
export async function startNatsSubscriber(): Promise<void> {
	const nc = getNatsConnection();
	if (!nc) {
		log.warn('NATS not available, push delivery disabled');
		return;
	}

	await ensureConsumer(nc, 'DM_EVENTS', 'push-dm', [SUBJECTS.DM_MESSAGE]);
	await ensureConsumer(nc, 'FRIEND_EVENTS', 'push-friends', [SUBJECTS.FRIEND_EVENT]);
	await ensureConsumer(nc, 'GROUP_EVENTS', 'push-groups', [
		SUBJECTS.GROUP_MESSAGE,
		SUBJECTS.GROUP_INVITE_CREATED,
	]);

	const js = nc.jetstream();

	const dmConsumer = await js.consumers.get('DM_EVENTS', 'push-dm');
	(async () => {
		for await (const msg of await dmConsumer.consume()) {
			try {
				const event: DmMessageEvent = JSON.parse(msg.string());
				await notifyUser(
					event.targetUserId,
					'dm',
					event.chatId,
					(showPreview) =>
						copy.dmMessage(
							event.message.author,
							event.chatId,
							event.message.content,
							event.message.attachments?.length ?? 0,
							showPreview,
						),
				);
				msg.ack();
			} catch (err) {
				log.error({ err }, 'Error processing DM event');
				msg.nak();
			}
		}
	})();

	const friendConsumer = await js.consumers.get('FRIEND_EVENTS', 'push-friends');
	(async () => {
		for await (const msg of await friendConsumer.consume()) {
			try {
				const event: FriendEvent = JSON.parse(msg.string());
				// Only the two that are news to the recipient. `friend_removed`,
				// `friend_declined` and `friend_cancelled` are things you would not
				// thank an app for announcing.
				if (event.type === 'friend_request') {
					await notifyUser(event.toUserId, 'friend', undefined, () => copy.friendRequest());
				} else if (event.type === 'friend_accepted') {
					// The acceptance travels to whoever originally asked.
					await notifyUser(event.toUserId, 'friend', undefined, () => copy.friendAccepted());
				}
				msg.ack();
			} catch (err) {
				log.error({ err }, 'Error processing friend event');
				msg.nak();
			}
		}
	})();

	const groupConsumer = await js.consumers.get('GROUP_EVENTS', 'push-groups');
	(async () => {
		for await (const msg of await groupConsumer.consume()) {
			try {
				if (msg.subject === SUBJECTS.GROUP_MESSAGE) {
					const e: GroupMessageEvent = JSON.parse(msg.string());
					// "X joined the group" and friends are written by the server, not
					// by a person, and nobody wants their phone lit up for them.
					if (e.message.systemKind) {
						msg.ack();
						continue;
					}
					// `targetUserIds` is the full member list, author included —
					// ws-gateway can send it to everyone because the sender's own
					// client ignores the echo, but a push to the author would be the
					// phone buzzing about their own message.
					const recipients = e.targetUserIds.filter((id) => id !== e.message.authorId);
					await notifyUsers(
						recipients,
						'group',
						e.groupId,
						(showPreview) =>
							copy.groupMessage(
								e.message.author,
								e.groupId,
								e.message.content,
								e.message.attachments?.length ?? 0,
								showPreview,
							),
					);
				} else if (msg.subject === SUBJECTS.GROUP_INVITE_CREATED) {
					const e: GroupInviteCreatedEvent = JSON.parse(msg.string());
					await notifyUsers(
						e.targetUserIds,
						'invite',
						e.invite.groupId,
						() => copy.groupInvite(e.invite.groupName, e.invite.inviterUsername),
					);
				}
				msg.ack();
			} catch (err) {
				log.error({ err }, 'Error processing group event');
				msg.nak();
			}
		}
	})();

	log.info('Push event subscribers active');
}
