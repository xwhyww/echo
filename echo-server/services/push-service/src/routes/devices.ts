import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { authMiddleware, type AuthEnv } from '@echo/shared';
import { createDb } from '../db/index.js';
import { deviceTokens } from '../db/schema.js';
import { loadSettings, saveSettings, type NotificationSettings } from '../settings.js';
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

// ─── Notification settings ──────────────────────────────────────

deviceRoutes.get('/settings', async (c) => {
	const userId = c.get('user').userId;
	return c.json({ settings: await loadSettings(userId) });
});

/**
 * Partial update — only the keys present in the body are changed, so the client
 * can flip one switch without having to send (and risk clobbering) the rest.
 *
 * Every field is validated by type rather than trusted, and unknown keys are
 * dropped: the body reaches here straight from the network.
 */
deviceRoutes.patch('/settings', async (c) => {
	const userId = c.get('user').userId;
	const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body) return c.json({ error: 'invalid body' }, 400);

	const patch: Partial<NotificationSettings> = {};

	for (const key of ['enabled', 'directMessages', 'groupMessages', 'friendRequests', 'groupInvites'] as const) {
		if (typeof body[key] === 'boolean') patch[key] = body[key] as boolean;
	}
	// Tri-state: true, false, or null for "follow the server default".
	if (body.showPreview === null || typeof body.showPreview === 'boolean') {
		patch.showPreview = body.showPreview as boolean | null;
	}
	for (const key of ['mutedChats', 'mutedGroups'] as const) {
		const value = body[key];
		if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
			// Deduplicated and capped: this list is written by the client and read
			// on every delivery, and nothing legitimate needs a thousand entries.
			patch[key] = [...new Set(value as string[])].slice(0, 500);
		}
	}

	if (Object.keys(patch).length === 0) return c.json({ error: 'nothing to update' }, 400);

	return c.json({ settings: await saveSettings(userId, patch) });
});
