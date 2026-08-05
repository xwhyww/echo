/**
 * The suppression rule, end to end: with the user's app connected to
 * ws-gateway, a DM must NOT produce a push — the open app already got it over
 * the socket.
 *
 * Needs ws-gateway and push-service running:
 *   pnpm --filter @echo/push-service exec tsx scripts/smoke-suppression.ts
 */
import { signToken, createNatsConnection, setupStreams, SUBJECTS } from '@echo/shared';
import { config } from '../src/config.js';

const USER = '11111111-1111-1111-1111-111111111111';
const SENDER = '22222222-2222-2222-2222-222222222222';
const token = signToken({ userId: USER, phone: '+10000000000' } as never, config.jwtSecret);

async function presence(): Promise<boolean> {
	const r = await fetch(`${config.wsGatewayHttpUrl}/internal/presence/${USER}`, {
		headers: { 'X-Internal-Key': config.internalApiKey },
	});
	return ((await r.json()) as { online: boolean }).online;
}

async function publishDm(marker: string) {
	const nc = await createNatsConnection(config.natsUrl);
	await setupStreams(nc);
	await nc.jetstream().publish(
		SUBJECTS.DM_MESSAGE,
		JSON.stringify({
			targetUserId: USER,
			chatId: 'chat-suppression',
			message: {
				id: marker, chatId: 'chat-suppression', authorId: SENDER, content: marker,
				attachments: [], isEdited: false, createdAt: new Date().toISOString(),
				author: { id: SENDER, username: 'alice', displayName: 'Alice', avatarUrl: null },
			},
		}),
	);
	await nc.drain();
}

async function main() {
	const ws = new WebSocket(`ws://localhost:3004/ws?token=${token}`);
	await new Promise<void>((resolve, reject) => {
		ws.addEventListener('open', () => resolve());
		ws.addEventListener('error', (e) => reject(new Error(String(e))));
	});
	// The connection is registered on open, but give the gateway a beat.
	await new Promise((r) => setTimeout(r, 300));
	console.log('connected; ws-gateway reports online =', await presence());

	await publishDm('WHILE-CONNECTED');
	console.log('published DM while connected — expect NO "notification dropped" line');
	await new Promise((r) => setTimeout(r, 1500));

	ws.close();
	await new Promise((r) => setTimeout(r, 500));
	console.log('disconnected; ws-gateway reports online =', await presence());

	await publishDm('WHILE-OFFLINE');
	console.log('published DM while offline — expect ONE "notification dropped" line');
	await new Promise((r) => setTimeout(r, 1500));
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
