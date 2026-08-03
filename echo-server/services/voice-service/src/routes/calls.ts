import { Hono, type Context } from 'hono';
import { eq } from 'drizzle-orm';
import { authMiddleware, type AuthEnv, type CallParty } from '@echo/shared';
import { createDb } from '../db/index.js';
import { userCache } from '../db/schema.js';
import { config } from '../config.js';
import { callRoomName, createCallToken } from '../livekit.js';
import {
	publishCallRing,
	publishCallAccepted,
	publishCallDeclined,
	publishCallCancelled,
	publishCallEnded,
} from '../nats.js';

const db = createDb(config.databaseUrl);

export const callsRoutes = new Hono<AuthEnv>();
callsRoutes.use('*', authMiddleware(config.jwtSecret));

async function loadParty(userId: string): Promise<CallParty> {
	const [u] = await db
		.select({
			id: userCache.id,
			username: userCache.username,
			displayName: userCache.displayName,
			avatarUrl: userCache.avatarUrl,
		})
		.from(userCache)
		.where(eq(userCache.id, userId))
		.limit(1);
	return {
		id: userId,
		username: u?.username ?? userId,
		displayName: u?.displayName ?? null,
		avatarUrl: u?.avatarUrl ?? null,
	};
}

// ─── Invite — caller starts a call ──────────────────────────────
// Signs the caller a LiveKit token for the deterministic DM room and rings the
// callee over NATS → ws-gateway. The caller connects immediately and waits in
// the (initially empty) room; the callee joins on accept.
callsRoutes.post('/calls/invite', async (c) => {
	const me = c.get('user');
	const body = await c.req.json().catch(() => ({}));
	const targetUserId = String(body?.targetUserId ?? '');
	const video = Boolean(body?.video);

	if (!targetUserId) return c.json({ error: 'targetUserId required' }, 400);
	if (targetUserId === me.userId) return c.json({ error: 'cannot call yourself' }, 400);

	const room = callRoomName(me.userId, targetUserId);
	const caller = await loadParty(me.userId);
	const token = await createCallToken({
		room,
		userId: me.userId,
		displayName: caller.displayName ?? caller.username,
	});

	publishCallRing({ targetUserId, roomName: room, from: caller, video }).catch((err) => {
		console.warn('[voice] publishCallRing failed:', err);
	});

	return c.json({ url: config.livekitPublicUrl, token, roomName: room });
});

// ─── Accept — callee joins ──────────────────────────────────────
callsRoutes.post('/calls/accept', async (c) => {
	const me = c.get('user');
	const body = await c.req.json().catch(() => ({}));
	const peerUserId = String(body?.peerUserId ?? '');
	if (!peerUserId) return c.json({ error: 'peerUserId required' }, 400);

	const room = callRoomName(me.userId, peerUserId);
	const callee = await loadParty(me.userId);
	const token = await createCallToken({
		room,
		userId: me.userId,
		displayName: callee.displayName ?? callee.username,
	});

	publishCallAccepted({ targetUserId: peerUserId, roomName: room, fromUserId: me.userId }).catch((err) => {
		console.warn('[voice] publishCallAccepted failed:', err);
	});

	return c.json({ url: config.livekitPublicUrl, token, roomName: room });
});

// ─── Decline / Cancel / End ─────────────────────────────────────
// decline: callee rejects a ringing call (notifies caller).
// cancel:  caller gives up before the callee answered (notifies callee).
// end:     either party hangs up an answered call (notifies the peer).
// All three are best-effort fire-and-forget signals; the LiveKit room frees
// itself once both peers disconnect.

function signalRoute(
	publisher: (e: { targetUserId: string; roomName: string; fromUserId: string }) => Promise<void>,
	label: string,
) {
	return async (c: Context<AuthEnv>) => {
		const me = c.get('user');
		const body = await c.req.json().catch(() => ({}));
		const peerUserId = String(body?.peerUserId ?? '');
		if (!peerUserId) return c.json({ error: 'peerUserId required' }, 400);
		const room = callRoomName(me.userId, peerUserId);
		publisher({ targetUserId: peerUserId, roomName: room, fromUserId: me.userId }).catch((err) => {
			console.warn(`[voice] ${label} failed:`, err);
		});
		return c.json({ success: true });
	};
}

callsRoutes.post('/calls/decline', signalRoute(publishCallDeclined, 'publishCallDeclined'));
callsRoutes.post('/calls/cancel', signalRoute(publishCallCancelled, 'publishCallCancelled'));
callsRoutes.post('/calls/end', signalRoute(publishCallEnded, 'publishCallEnded'));
