import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { createDb } from '../db/index.js';
import { userProfiles } from '../db/schema.js';
import { config } from '../config.js';

const db = createDb(config.databaseUrl);

// Service-to-service auth via shared static key. Gateway only proxies
// /users/*, so /internal/* is unreachable from outside the docker network —
// the header check is defense in depth.
const internalAuth = createMiddleware(async (c, next) => {
	const key = c.req.header('X-Internal-Key');
	if (!key || key !== config.internalApiKey) {
		return c.json({ error: 'Unauthorized' }, 401);
	}
	await next();
});

export const internalRoutes = new Hono();

internalRoutes.use('*', internalAuth);

// Bulk-load endpoint for pers-chats-service to hydrate its user_cache mirror
// on cold start and during periodic reconciliation. Returns only the columns
// the cache stores; consumer upserts with onConflictDoUpdate.
internalRoutes.get('/users-snapshot', async (c) => {
	const rows = await db
		.select({
			id: userProfiles.id,
			username: userProfiles.username,
			displayName: userProfiles.displayName,
			avatarUrl: userProfiles.avatarUrl,
			isOnline: userProfiles.isOnline,
			privacyOnlineStatus: userProfiles.privacyOnlineStatus,
			privacyMessaging: userProfiles.privacyMessaging,
			privacyPhoto: userProfiles.privacyPhoto,
			privacyGroupInvite: userProfiles.privacyGroupInvite,
		})
		.from(userProfiles);

	return c.json({ users: rows });
});
