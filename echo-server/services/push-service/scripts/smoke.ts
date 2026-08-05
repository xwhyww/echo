/**
 * Manual end-to-end check for the push pipeline, run against local infra:
 *   pnpm --filter @echo/push-service exec tsx scripts/smoke.ts
 *
 * Registers a device, publishes the three notification-worthy events onto the
 * same JetStream subjects the real services use, and leaves the assertions to
 * the push-service log — with APNs unconfigured each one should print
 * "APNs not configured — notification dropped".
 */
import { signToken, createNatsConnection, setupStreams, SUBJECTS } from '@echo/shared';
import { config } from '../src/config.js';

const BASE = `http://localhost:${config.port}`;
const USER = '11111111-1111-1111-1111-111111111111';
const SENDER = '22222222-2222-2222-2222-222222222222';

const token = signToken({ userId: USER, phone: '+10000000000' } as never, config.jwtSecret);

async function main() {
	const register = await fetch(`${BASE}/push/devices`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ token: 'aa'.repeat(32), platform: 'ios', environment: 'sandbox' }),
	});
	console.log('register:', register.status, await register.text());

	// The sender gets a device too, so "don't notify the author" is actually
	// exercised rather than passing because they had no devices to notify.
	const senderToken = signToken({ userId: SENDER, phone: '+10000000001' } as never, config.jwtSecret);
	const registerSender = await fetch(`${BASE}/push/devices`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${senderToken}` },
		body: JSON.stringify({ token: 'bb'.repeat(32), platform: 'ios', environment: 'sandbox' }),
	});
	console.log('register sender:', registerSender.status);

	const unauth = await fetch(`${BASE}/push/devices`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ token: 'x', platform: 'ios' }),
	});
	console.log('register without a token (expect 401):', unauth.status);

	const bad = await fetch(`${BASE}/push/devices`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ platform: 'ios' }),
	});
	console.log('register without a device token (expect 400):', bad.status);

	const nc = await createNatsConnection(config.natsUrl);
	await setupStreams(nc);
	const js = nc.jetstream();

	const author = { id: SENDER, username: 'alice', displayName: 'Alice', avatarUrl: null };

	await js.publish(
		SUBJECTS.DM_MESSAGE,
		JSON.stringify({
			targetUserId: USER,
			chatId: 'chat-1',
			message: {
				id: 'm1', chatId: 'chat-1', authorId: SENDER, content: 'secret text',
				attachments: [], isEdited: false, createdAt: new Date().toISOString(), author,
			},
		}),
	);
	console.log('published dm');

	await js.publish(
		SUBJECTS.FRIEND_EVENT,
		JSON.stringify({ type: 'friend_request', fromUserId: SENDER, toUserId: USER }),
	);
	console.log('published friend_request');

	await js.publish(
		SUBJECTS.GROUP_MESSAGE,
		JSON.stringify({
			// Author included, exactly as groups-service sends it — the service must
			// not notify SENDER about SENDER's own message.
			targetUserIds: [USER, SENDER],
			groupId: 'group-1',
			message: {
				id: 'gm1', groupId: 'group-1', authorId: SENDER, content: 'hello group',
				attachments: [], isEdited: false, createdAt: new Date().toISOString(), author,
			},
		}),
	);
	console.log('published group message');

	await new Promise((r) => setTimeout(r, 1500));
	await nc.drain();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
