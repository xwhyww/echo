import { Hono } from 'hono';
import { and, eq, or, inArray, lt, desc, count } from 'drizzle-orm';
import { authMiddleware, type AuthEnv, SUBJECTS } from '@echo/shared';
import { createDb } from '../db/index.js';
import { friendships } from '../db/schema.js';
import { config } from '../config.js';
import { getNatsConnection } from '../nats.js';

const db = createDb(config.databaseUrl);

export const friendsRoutes = new Hono<AuthEnv>();

friendsRoutes.use('*', authMiddleware(config.jwtSecret));

// Send friend request
friendsRoutes.post('/request/:userId', async (c) => {
	const currentUserId = c.get('user').userId;
	const targetUserId = c.req.param('userId');

	if (currentUserId === targetUserId) {
		return c.json({ error: 'Cannot send friend request to yourself' }, 400);
	}

	// Check if any friendship already exists between these two users
	const existing = await db.query.friendships.findFirst({
		where: or(
			and(eq(friendships.requesterId, currentUserId), eq(friendships.addresseeId, targetUserId)),
			and(eq(friendships.requesterId, targetUserId), eq(friendships.addresseeId, currentUserId)),
		),
	});

	if (existing) {
		if (existing.status === 'accepted') {
			return c.json({ error: 'Already friends' }, 409);
		}
		if (existing.status === 'pending') {
			// If the other user already sent us a request, auto-accept
			if (existing.requesterId === targetUserId) {
				const [updated] = await db
					.update(friendships)
					.set({ status: 'accepted', updatedAt: new Date() })
					.where(eq(friendships.id, existing.id))
					.returning();

				publishFriendEvent('friend_accepted', currentUserId, targetUserId);

				return c.json({ friendship: updated, status: 'accepted' });
			}
			return c.json({ error: 'Friend request already sent' }, 409);
		}
		if (existing.status === 'declined') {
			// Re-send: update the existing row
			const [updated] = await db
				.update(friendships)
				.set({ requesterId: currentUserId, addresseeId: targetUserId, status: 'pending', updatedAt: new Date() })
				.where(eq(friendships.id, existing.id))
				.returning();

			publishFriendEvent('friend_request', currentUserId, targetUserId);

			return c.json({ friendship: updated, status: 'pending' }, 201);
		}
	}

	const [friendship] = await db
		.insert(friendships)
		.values({ requesterId: currentUserId, addresseeId: targetUserId })
		.returning();

	publishFriendEvent('friend_request', currentUserId, targetUserId);

	return c.json({ friendship, status: 'pending' }, 201);
});

// Accept friend request
friendsRoutes.post('/accept/:userId', async (c) => {
	const currentUserId = c.get('user').userId;
	const requesterId = c.req.param('userId');

	const request = await db.query.friendships.findFirst({
		where: and(
			eq(friendships.requesterId, requesterId),
			eq(friendships.addresseeId, currentUserId),
			eq(friendships.status, 'pending'),
		),
	});

	if (!request) {
		return c.json({ error: 'No pending request found' }, 404);
	}

	const [updated] = await db
		.update(friendships)
		.set({ status: 'accepted', updatedAt: new Date() })
		.where(eq(friendships.id, request.id))
		.returning();

	publishFriendEvent('friend_accepted', currentUserId, requesterId);

	return c.json({ friendship: updated });
});

// Decline friend request
friendsRoutes.post('/decline/:userId', async (c) => {
	const currentUserId = c.get('user').userId;
	const requesterId = c.req.param('userId');

	const request = await db.query.friendships.findFirst({
		where: and(
			eq(friendships.requesterId, requesterId),
			eq(friendships.addresseeId, currentUserId),
			eq(friendships.status, 'pending'),
		),
	});

	if (!request) {
		return c.json({ error: 'No pending request found' }, 404);
	}

	const [updated] = await db
		.update(friendships)
		.set({ status: 'declined', updatedAt: new Date() })
		.where(eq(friendships.id, request.id))
		.returning();

	publishFriendEvent('friend_declined', currentUserId, requesterId);

	return c.json({ friendship: updated });
});

// Remove friend
friendsRoutes.delete('/:userId', async (c) => {
	const currentUserId = c.get('user').userId;
	const targetUserId = c.req.param('userId');

	const friendship = await db.query.friendships.findFirst({
		where: and(
			or(
				and(eq(friendships.requesterId, currentUserId), eq(friendships.addresseeId, targetUserId)),
				and(eq(friendships.requesterId, targetUserId), eq(friendships.addresseeId, currentUserId)),
			),
			eq(friendships.status, 'accepted'),
		),
	});

	if (!friendship) {
		return c.json({ error: 'Not friends' }, 404);
	}

	await db.delete(friendships).where(eq(friendships.id, friendship.id));

	publishFriendEvent('friend_removed', currentUserId, targetUserId);

	return c.json({ success: true });
});

// Cancel outgoing friend request
friendsRoutes.delete('/request/:userId', async (c) => {
	const currentUserId = c.get('user').userId;
	const targetUserId = c.req.param('userId');

	const request = await db.query.friendships.findFirst({
		where: and(
			eq(friendships.requesterId, currentUserId),
			eq(friendships.addresseeId, targetUserId),
			eq(friendships.status, 'pending'),
		),
	});

	if (!request) {
		return c.json({ error: 'No pending request found' }, 404);
	}

	await db.delete(friendships).where(eq(friendships.id, request.id));

	publishFriendEvent('friend_cancelled', currentUserId, targetUserId);

	return c.json({ success: true });
});

// Bulk friendship status check
friendsRoutes.post('/status/bulk', async (c) => {
	const currentUserId = c.get('user').userId;
	const { userIds } = await c.req.json<{ userIds: string[] }>();

	if (!Array.isArray(userIds) || userIds.length === 0) {
		return c.json({ statuses: {} });
	}

	const allTargetIds = [...new Set(userIds)];

	const rows = await db.query.friendships.findMany({
		where: or(
			and(
				eq(friendships.requesterId, currentUserId),
				inArray(friendships.addresseeId, allTargetIds),
			),
			and(
				inArray(friendships.requesterId, allTargetIds),
				eq(friendships.addresseeId, currentUserId),
			),
		),
	});

	const statuses: Record<string, { status: string; direction?: string }> = {};

	for (const targetId of allTargetIds) {
		if (targetId === currentUserId) {
			statuses[targetId] = { status: 'self' };
			continue;
		}

		const row = rows.find(
			(r) =>
				(r.requesterId === currentUserId && r.addresseeId === targetId) ||
				(r.requesterId === targetId && r.addresseeId === currentUserId),
		);

		if (!row || row.status === 'declined') {
			statuses[targetId] = { status: 'none' };
		} else if (row.status === 'accepted') {
			statuses[targetId] = { status: 'friends' };
		} else if (row.status === 'pending') {
			statuses[targetId] = {
				status: 'pending',
				direction: row.requesterId === currentUserId ? 'outgoing' : 'incoming',
			};
		}
	}

	return c.json({ statuses });
});

// Lightweight count of pending incoming friend requests (for sidebar badge)
friendsRoutes.get('/requests/incoming/count', async (c) => {
	const currentUserId = c.get('user').userId;

	const [row] = await db
		.select({ value: count() })
		.from(friendships)
		.where(and(
			eq(friendships.addresseeId, currentUserId),
			eq(friendships.status, 'pending'),
		));

	return c.json({ count: row?.value ?? 0 });
});

// Get friendship status with a specific user
friendsRoutes.get('/status/:userId', async (c) => {
	const currentUserId = c.get('user').userId;
	const targetUserId = c.req.param('userId');

	if (currentUserId === targetUserId) {
		return c.json({ status: 'self' });
	}

	const friendship = await db.query.friendships.findFirst({
		where: or(
			and(eq(friendships.requesterId, currentUserId), eq(friendships.addresseeId, targetUserId)),
			and(eq(friendships.requesterId, targetUserId), eq(friendships.addresseeId, currentUserId)),
		),
	});

	if (!friendship) {
		return c.json({ status: 'none' });
	}

	if (friendship.status === 'accepted') {
		return c.json({ status: 'friends' });
	}

	if (friendship.status === 'pending') {
		const direction = friendship.requesterId === currentUserId ? 'outgoing' : 'incoming';
		return c.json({ status: 'pending', direction });
	}

	// declined — treat as none for the requester
	return c.json({ status: 'none' });
});

const MAX_PAGE_LIMIT = 100;
const DEFAULT_PAGE_LIMIT = 30;

function parsePagination(c: { req: { query: (k: string) => string | undefined } }) {
	const cursorRaw = c.req.query('cursor');
	const limitRaw = c.req.query('limit');
	const limit = Math.min(
		MAX_PAGE_LIMIT,
		Math.max(1, Number(limitRaw) || DEFAULT_PAGE_LIMIT),
	);
	const cursor = cursorRaw ? new Date(cursorRaw) : null;
	return { cursor: cursor && !isNaN(cursor.getTime()) ? cursor : null, limit };
}

// List friends (paginated, newest acceptance first)
friendsRoutes.get('/', async (c) => {
	const currentUserId = c.get('user').userId;
	const { cursor, limit } = parsePagination(c);

	const rows = await db.query.friendships.findMany({
		where: and(
			or(
				eq(friendships.requesterId, currentUserId),
				eq(friendships.addresseeId, currentUserId),
			),
			eq(friendships.status, 'accepted'),
			...(cursor ? [lt(friendships.updatedAt, cursor)] : []),
		),
		orderBy: [desc(friendships.updatedAt)],
		limit: limit + 1,
	});

	const hasMore = rows.length > limit;
	const page = hasMore ? rows.slice(0, limit) : rows;
	const items = page.map((r) => ({
		userId: r.requesterId === currentUserId ? r.addresseeId : r.requesterId,
		since: r.updatedAt.toISOString(),
	}));
	const nextCursor = hasMore && page.length > 0
		? page[page.length - 1].updatedAt.toISOString()
		: null;

	return c.json({ items, nextCursor });
});

// List pending incoming requests (paginated, newest first)
friendsRoutes.get('/requests/incoming', async (c) => {
	const currentUserId = c.get('user').userId;
	const { cursor, limit } = parsePagination(c);

	const rows = await db.query.friendships.findMany({
		where: and(
			eq(friendships.addresseeId, currentUserId),
			eq(friendships.status, 'pending'),
			...(cursor ? [lt(friendships.createdAt, cursor)] : []),
		),
		orderBy: [desc(friendships.createdAt)],
		limit: limit + 1,
	});

	const hasMore = rows.length > limit;
	const page = hasMore ? rows.slice(0, limit) : rows;
	const items = page.map((r) => ({
		userId: r.requesterId,
		since: r.createdAt.toISOString(),
	}));
	const nextCursor = hasMore && page.length > 0
		? page[page.length - 1].createdAt.toISOString()
		: null;

	return c.json({ items, nextCursor });
});

// List pending outgoing requests (paginated, newest first)
friendsRoutes.get('/requests/outgoing', async (c) => {
	const currentUserId = c.get('user').userId;
	const { cursor, limit } = parsePagination(c);

	const rows = await db.query.friendships.findMany({
		where: and(
			eq(friendships.requesterId, currentUserId),
			eq(friendships.status, 'pending'),
			...(cursor ? [lt(friendships.createdAt, cursor)] : []),
		),
		orderBy: [desc(friendships.createdAt)],
		limit: limit + 1,
	});

	const hasMore = rows.length > limit;
	const page = hasMore ? rows.slice(0, limit) : rows;
	const items = page.map((r) => ({
		userId: r.addresseeId,
		since: r.createdAt.toISOString(),
	}));
	const nextCursor = hasMore && page.length > 0
		? page[page.length - 1].createdAt.toISOString()
		: null;

	return c.json({ items, nextCursor });
});

function publishFriendEvent(type: string, fromUserId: string, toUserId: string) {
	const nc = getNatsConnection();
	if (!nc) return;
	nc.publish(SUBJECTS.FRIEND_EVENT, JSON.stringify({ type, fromUserId, toUserId }));
}
