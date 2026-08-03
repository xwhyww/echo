import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { createDb } from '../db/index.js';
import { groupMembers } from '../db/schema.js';
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

// Bulk-load endpoint for blob-service to hydrate its group_members_mirror.
// Idempotent for the consumer (onConflictDoNothing on insert).
internalRoutes.get('/group-memberships', async (c) => {
	const rows = await db
		.select({ groupId: groupMembers.groupId, userId: groupMembers.userId })
		.from(groupMembers);

	const byGroup = new Map<string, string[]>();
	for (const r of rows) {
		const list = byGroup.get(r.groupId) ?? [];
		list.push(r.userId);
		byGroup.set(r.groupId, list);
	}
	const memberships = Array.from(byGroup.entries()).map(([groupId, userIds]) => ({ groupId, userIds }));

	return c.json({ memberships });
});

// Same as /group-memberships but flat rows that include role + joinedAt — for
// voice-service, which needs role to authorize channel CRUD without a sync
// call back to groups-service.
internalRoutes.get('/group-members-detailed', async (c) => {
	const rows = await db
		.select({
			groupId: groupMembers.groupId,
			userId: groupMembers.userId,
			role: groupMembers.role,
			joinedAt: groupMembers.joinedAt,
		})
		.from(groupMembers);

	return c.json({
		members: rows.map((r) => ({
			groupId: r.groupId,
			userId: r.userId,
			role: r.role,
			joinedAt: r.joinedAt.toISOString(),
		})),
	});
});
