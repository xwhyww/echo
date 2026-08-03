import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { createDb } from '../db/index.js';
import { personalChats } from '../db/schema.js';
import { config } from '../config.js';

const db = createDb(config.databaseUrl);

// Service-to-service auth: shared static key in INTERNAL_API_KEY. The gateway
// only proxies /personal-chats/*, so /internal/* is unreachable from outside
// the docker network — the header check is defense in depth.
const internalAuth = createMiddleware(async (c, next) => {
	const key = c.req.header('X-Internal-Key');
	if (!key || key !== config.internalApiKey) {
		return c.json({ error: 'Unauthorized' }, 401);
	}
	await next();
});

export const internalRoutes = new Hono();

internalRoutes.use('*', internalAuth);

// Bulk-load endpoint for blob-service to hydrate its dm_chat_members mirror
// on cold start. Returns every DM chat with its two member ids. Idempotent
// for the consumer (onConflictDoNothing on insert).
internalRoutes.get('/dm-memberships', async (c) => {
	const rows = await db
		.select({
			chatId: personalChats.id,
			user1Id: personalChats.user1Id,
			user2Id: personalChats.user2Id,
		})
		.from(personalChats);

	const memberships = rows.map((r) => ({
		chatId: r.chatId,
		userIds: [r.user1Id, r.user2Id],
	}));

	return c.json({ memberships });
});
