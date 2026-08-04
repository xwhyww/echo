import { Hono } from 'hono';
import { createNodeWebSocket } from '@hono/node-ws';
import { verifyToken, SUBJECTS, type IncomingWsMessage } from '@echo/shared';
import { config } from './config.js';
import { addConnection, removeConnection, isUserOnline, broadcastPresence, setUserPrivacy, setUserFriends, clearUserCaches, getUserPrivacy, setPresenceCallback, broadcastFromUser } from './connections.js';
import { getNatsConnection } from './nats.js';
import { log } from './log.js';

export const app = new Hono();
export const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

function publishPresence(userId: string, online: boolean) {
	const nc = getNatsConnection();
	if (!nc) return;
	const subject = online ? SUBJECTS.PRESENCE_ONLINE : SUBJECTS.PRESENCE_OFFLINE;
	nc.publish(subject, JSON.stringify({ userId, online }));
}

// Wire up: when privacy changes while online, update DB caches via NATS
setPresenceCallback(publishPresence);

async function fetchUserPrivacy(userId: string, token: string): Promise<void> {
	try {
		const resp = await fetch(`${config.userServiceUrl}/users/${userId}`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (resp.ok) {
			const data = await resp.json() as { user: { privacyOnlineStatus?: string } };
			if (data.user.privacyOnlineStatus) {
				setUserPrivacy(userId, data.user.privacyOnlineStatus);
			}
		}
	} catch (err) {
		log.error({ err }, 'Failed to fetch user privacy');
	}
}

async function fetchUserFriends(userId: string, token: string): Promise<void> {
	try {
		const friendIds = new Set<string>();
		let cursor: string | null = null;
		const PAGE = 100;
		// Paginate through all pages — ws-gateway needs the complete set for
		// privacy gating (presence/typing).
		while (true) {
			const qs = new URLSearchParams({ limit: String(PAGE) });
			if (cursor) qs.set('cursor', cursor);
			const resp = await fetch(`${config.friendsServiceUrl}/friends?${qs}`, {
				headers: { Authorization: `Bearer ${token}` },
			});
			if (!resp.ok) break;
			const data = await resp.json() as { items: { userId: string }[]; nextCursor: string | null };
			for (const item of data.items) friendIds.add(item.userId);
			if (!data.nextCursor) break;
			cursor = data.nextCursor;
		}
		setUserFriends(userId, friendIds);
	} catch (err) {
		log.error({ err }, 'Failed to fetch user friends');
	}
}

app.get('/health', (c) => c.json({ status: 'ok' }));

app.get(
	'/ws',
	upgradeWebSocket((c) => {
		const token = c.req.query('token');
		const payload = token ? verifyToken(token, config.jwtSecret) : null;

		if (!payload) {
			return {
				onOpen(_evt, ws) {
					ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
					ws.close(1008, 'Unauthorized');
				},
			};
		}

		const userId = payload.userId;
		const username = payload.username;

		return {
			onOpen(_evt, ws) {
				addConnection(userId, ws);

				// Fetch privacy settings and friends list, then broadcast based on privacy
				Promise.all([
					fetchUserPrivacy(userId, token!),
					fetchUserFriends(userId, token!),
				]).then(() => {
					const privacy = getUserPrivacy(userId);
					if (privacy !== 'nobody') {
						publishPresence(userId, true);
					}
					broadcastPresence(userId, true);
				});

				ws.send(JSON.stringify({ type: 'connected', userId }));
			},
			onMessage(evt) {
				const raw = typeof evt.data === 'string' ? evt.data : evt.data.toString();
				handleIncomingMessage(userId, username, raw);
			},
			onClose(_evt, ws) {
				removeConnection(userId, ws);

				if (!isUserOnline(userId)) {
					const privacy = getUserPrivacy(userId);
					if (privacy !== 'nobody') {
						publishPresence(userId, false);
					}
					broadcastPresence(userId, false);
					clearUserCaches(userId);
				}
			},
		};
	})
);

function handleIncomingMessage(userId: string, username: string, raw: string) {
	let data: IncomingWsMessage;
	try {
		data = JSON.parse(raw);
	} catch {
		return;
	}

	switch (data.type) {
		case 'typing': {
			if (!data.chatId) return;
			// Gate by sender's online-status privacy: 'nobody' hides typing from
			// everyone; 'friends' limits to friends; 'all' broadcasts.
			broadcastFromUser(userId, { type: 'typing', chatId: data.chatId, userId, username });
			break;
		}
		case 'typing_channel': {
			if (!data.channelId) return;
			broadcastFromUser(userId, { type: 'typing_channel', channelId: data.channelId, userId, username });
			break;
		}
	}
}
