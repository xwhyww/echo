import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { createDb } from '../db/index.js';
import { friendships } from '../db/schema.js';
import { config } from '../config.js';

const db = createDb(config.databaseUrl);

const internalAuth = createMiddleware(async (c, next) => {
	const key = c.req.header('X-Internal-Key');
	if (!key || key !== config.internalApiKey) {
		return c.json({ error: 'Unauthorized' }, 401);
	}
	await next();
});

export const internalRoutes = new Hono();

internalRoutes.use('*', internalAuth);

// Bulk-load endpoint for pers-chats-service to hydrate its friendship_cache
// mirror. Returns every row including pending — pers-chats's privacy logic
// only treats 'accepted' as a friendship, but the cache stores both so it can
// short-circuit pending checks too.
internalRoutes.get('/friendships-snapshot', async (c) => {
	const rows = await db
		.select({
			id: friendships.id,
			requesterId: friendships.requesterId,
			addresseeId: friendships.addresseeId,
			status: friendships.status,
		})
		.from(friendships);

	return c.json({ friendships: rows });
});
