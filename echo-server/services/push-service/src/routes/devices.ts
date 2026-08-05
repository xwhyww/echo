import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { authMiddleware, type AuthEnv } from '@echo/shared';
import { createDb } from '../db/index.js';
import { deviceTokens } from '../db/schema.js';
import { config } from '../config.js';
import { log } from '../log.js';

const db = createDb(config.databaseUrl);

export const deviceRoutes = new Hono<AuthEnv>();

deviceRoutes.use('*', authMiddleware(config.jwtSecret));

/**
 * Register (or re-register) this install for notifications.
 *
 * The client calls this on every launch once signed in, not only the first
 * time: APNs rotates tokens on restore-from-backup, on reinstall, and
 * occasionally for its own reasons, and the only way to notice is to re-read
 * and re-send. Upserting on the token makes that idempotent, and moves the row
 * to the current user when a phone changes hands.
 */
deviceRoutes.post('/devices', async (c) => {
	const userId = c.get('user').userId;
	const body = await c.req.json().catch(() => null) as {
		token?: unknown;
		platform?: unknown;
		environment?: unknown;
	} | null;

	const token = typeof body?.token === 'string' ? body.token.trim() : '';
	const platform = body?.platform === 'ios' || body?.platform === 'android' ? body.platform : null;
	const environment =
		body?.environment === 'production' || body?.environment === 'sandbox'
			? body.environment
			: 'sandbox';

	if (!token || !platform) {
		return c.json({ error: 'token and platform are required' }, 400);
	}

	await db
		.insert(deviceTokens)
		.values({ userId, token, platform, environment })
		.onConflictDoUpdate({
			target: deviceTokens.token,
			set: { userId, platform, environment, lastSeenAt: new Date() },
		});

	log.info({ userId, platform, environment }, 'device registered');
	return c.json({ ok: true });
});

/**
 * Sign-out. Only the row matching *this* user is removed, so a stolen or stale
 * token cannot be used to silence someone else's phone.
 */
deviceRoutes.delete('/devices/:token', async (c) => {
	const userId = c.get('user').userId;
	const token = c.req.param('token');

	await db
		.delete(deviceTokens)
		.where(and(eq(deviceTokens.token, token), eq(deviceTokens.userId, userId)));

	return c.json({ ok: true });
});
