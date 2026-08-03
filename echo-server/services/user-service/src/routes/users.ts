import { Hono } from 'hono';
import { z } from 'zod';
import { or, eq, ne, and, sql, inArray } from 'drizzle-orm';
import { authMiddleware, type AuthEnv } from '@echo/shared';
import { createDb } from '../db/index.js';
import { userProfiles } from '../db/schema.js';
import { config } from '../config.js';

const db = createDb(config.databaseUrl);

async function checkFriendship(requesterId: string, targetId: string, token: string): Promise<boolean> {
	try {
		const resp = await fetch(`${config.friendsServiceUrl}/friends/status/${targetId}`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (resp.ok) {
			const data = await resp.json() as { status: string };
			return data.status === 'friends';
		}
	} catch {}
	return false;
}

// One round-trip to friends-service for the whole list. Used by handlers that
// fan out privacy checks across many users (search, bulk). On failure returns
// an empty map — applyPrivacy then treats every user as a non-friend, which is
// the safer default for privacy-gated fields.
async function bulkCheckFriendship(userIds: string[], token: string): Promise<Map<string, boolean>> {
	const map = new Map<string, boolean>();
	if (userIds.length === 0) return map;
	try {
		const resp = await fetch(`${config.friendsServiceUrl}/friends/status/bulk`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ userIds }),
		});
		if (resp.ok) {
			const data = (await resp.json()) as { statuses: Record<string, { status: string }> };
			for (const [id, s] of Object.entries(data.statuses ?? {})) {
				map.set(id, s.status === 'friends');
			}
		}
	} catch {}
	return map;
}

function applyPrivacy(
	user: Record<string, unknown>,
	isFriend: boolean,
) {
	const { privacyOnlineStatus, privacyPhone, privacyEmail, privacyProfile, privacyPhoto, ...result } = user;

	if (privacyOnlineStatus === 'nobody') {
		result.isOnline = false;
	} else if (privacyOnlineStatus === 'friends' && !isFriend) {
		result.isOnline = false;
	}

	if (privacyPhone === 'nobody') {
		result.phone = null;
	} else if (privacyPhone === 'friends' && !isFriend) {
		result.phone = null;
	}

	if (privacyEmail === 'nobody') {
		result.email = null;
	} else if (privacyEmail === 'friends' && !isFriend) {
		result.email = null;
	}

	if (privacyPhoto === 'nobody') {
		result.avatarUrl = null;
	} else if (privacyPhoto === 'friends' && !isFriend) {
		result.avatarUrl = null;
	}

	return result;
}

export const usersRoutes = new Hono<AuthEnv>();

usersRoutes.use('*', authMiddleware(config.jwtSecret));

usersRoutes.get('/search', async (c) => {
	const q = c.req.query('q')?.trim();

	if (!q || q.length < 2) {
		return c.json({ error: 'Query must be at least 2 characters' }, 400);
	}

	const currentUserId = c.get('user').userId;
	const phoneDigits = q.replace(/\D/g, '');
	const phoneSuffix = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits;

	const found = await db.query.userProfiles.findMany({
		where: and(
			ne(userProfiles.id, currentUserId),
			or(
				eq(userProfiles.username, q),
				eq(userProfiles.email, q),
				phoneDigits.length >= 10
					? sql`RIGHT(REGEXP_REPLACE(${userProfiles.phone}, '\\D', '', 'g'), 10) = ${phoneSuffix}`
					: undefined,
			)
		),
		columns: {
			id: true,
			username: true,
			displayName: true,
			avatarUrl: true,
			phone: true,
			isOnline: true,
			privacyOnlineStatus: true,
			privacyPhone: true,
			privacyPhoto: true,
		},
		limit: 10,
	});

	const token = c.req.header('Authorization')?.slice(7) ?? '';
	const idsNeedingCheck = found
		.filter((u) => u.privacyOnlineStatus === 'friends' || u.privacyPhone === 'friends' || u.privacyPhoto === 'friends')
		.map((u) => u.id);
	const friendMap = await bulkCheckFriendship(idsNeedingCheck, token);
	const users = found.map((user) => applyPrivacy(user, friendMap.get(user.id) ?? false));

	return c.json({ users });
});

// --- Update current user profile ---

const updateProfileSchema = z.object({
	displayName: z.string().min(1).max(64).optional(),
	phone: z.string().max(20).optional().nullable(),
	status: z.string().max(128).optional().nullable(),
});

usersRoutes.patch('/me', async (c) => {
	const currentUserId = c.get('user').userId;

	const body = await c.req.json();
	const parsed = updateProfileSchema.safeParse(body);

	if (!parsed.success) {
		return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
	}

	const updates: Record<string, unknown> = { updatedAt: new Date() };
	if (parsed.data.displayName !== undefined) updates.displayName = parsed.data.displayName;
	if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;
	if (parsed.data.status !== undefined) updates.status = parsed.data.status;

	if (Object.keys(updates).length === 1) {
		return c.json({ error: 'No fields to update' }, 400);
	}

	const [user] = await db
		.update(userProfiles)
		.set(updates)
		.where(eq(userProfiles.id, currentUserId))
		.returning({
			id: userProfiles.id,
			username: userProfiles.username,
			displayName: userProfiles.displayName,
			avatarUrl: userProfiles.avatarUrl,
			phone: userProfiles.phone,
			status: userProfiles.status,
			isOnline: userProfiles.isOnline,
		});

	if (!user) {
		return c.json({ error: 'User not found' }, 404);
	}

	return c.json({ user });
});

usersRoutes.get('/:id', async (c) => {
	const id = c.req.param('id');
	const currentUserId = c.get('user').userId;

	const user = await db.query.userProfiles.findFirst({
		where: eq(userProfiles.id, id),
		columns: {
			id: true,
			username: true,
			displayName: true,
			avatarUrl: true,
			email: true,
			phone: true,
			status: true,
			isOnline: true,
			privacyOnlineStatus: true,
			privacyPhone: true,
			privacyEmail: true,
			privacyMessaging: true,
			privacyPhoto: true,
			privacyProfile: true,
		},
	});

	if (!user) {
		return c.json({ error: 'User not found' }, 404);
	}

	// If requesting own profile, return as-is with privacy fields
	if (id === currentUserId) {
		return c.json({ user });
	}

	// Check friendship for privacy enforcement
	const token = c.req.header('Authorization')?.slice(7) ?? '';
	const needsFriendCheck = user.privacyProfile === 'friends' || user.privacyOnlineStatus === 'friends' || user.privacyPhone === 'friends' || user.privacyEmail === 'friends' || user.privacyPhoto === 'friends';
	const isFriend = needsFriendCheck ? await checkFriendship(currentUserId, id, token) : false;

	// Profile privacy: restrict access entirely
	if (user.privacyProfile === 'nobody' || (user.privacyProfile === 'friends' && !isFriend)) {
		return c.json({
			user: {
				id: user.id,
				username: user.username,
				displayName: user.displayName,
				avatarUrl: null,
				isOnline: false,
				profileRestricted: true,
			},
		});
	}

	return c.json({ user: applyPrivacy(user, isFriend) });
});

// Bulk fetch users by IDs
usersRoutes.post('/bulk', async (c) => {
	const currentUserId = c.get('user').userId;
	const { userIds } = await c.req.json<{ userIds: string[] }>();

	if (!Array.isArray(userIds) || userIds.length === 0) {
		return c.json({ users: [] });
	}

	const uniqueIds = [...new Set(userIds)].slice(0, 100);

	const found = await db.query.userProfiles.findMany({
		where: inArray(userProfiles.id, uniqueIds),
		columns: {
			id: true,
			username: true,
			displayName: true,
			avatarUrl: true,
			isOnline: true,
			privacyOnlineStatus: true,
			privacyPhoto: true,
		},
	});

	const token = c.req.header('Authorization')?.slice(7) ?? '';
	const idsNeedingCheck = found
		.filter((u) => u.id !== currentUserId && (u.privacyOnlineStatus === 'friends' || u.privacyPhoto === 'friends'))
		.map((u) => u.id);
	const friendMap = await bulkCheckFriendship(idsNeedingCheck, token);

	const users = found.map((user) => {
		if (user.id === currentUserId) {
			const { privacyOnlineStatus, privacyPhoto, ...rest } = user;
			return rest;
		}
		return applyPrivacy(user, friendMap.get(user.id) ?? false);
	});

	return c.json({ users });
});

// Internal: update online status (called by ws-gateway)
usersRoutes.patch('/:id/online', async (c) => {
	const id = c.req.param('id');
	const { isOnline } = await c.req.json<{ isOnline: boolean }>();

	await db.update(userProfiles).set({ isOnline, updatedAt: new Date() }).where(eq(userProfiles.id, id));

	return c.json({ success: true });
});
