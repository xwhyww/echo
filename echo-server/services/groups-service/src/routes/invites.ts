import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { and, eq, desc } from 'drizzle-orm';
import { authMiddleware, type AuthEnv } from '@echo/shared';
import { createDb } from '../db/index.js';
import { groups, groupMembers, groupInvites, userCache } from '../db/schema.js';
import { config } from '../config.js';
import { can, canInvite, type Role, type InvitePolicy } from '../permissions.js';
import {
	publishGroupInviteCreated, publishGroupInviteResponded,
	publishGroupMemberJoined,
} from '../nats.js';

const db = createDb(config.databaseUrl);

export const invitesRoutes = new Hono<AuthEnv>();
invitesRoutes.use('*', authMiddleware(config.jwtSecret));

async function membership(groupId: string, userId: string): Promise<Role | null> {
	const [m] = await db
		.select({ role: groupMembers.role })
		.from(groupMembers)
		.where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
		.limit(1);
	return (m?.role as Role) ?? null;
}

async function listMemberIds(groupId: string): Promise<string[]> {
	const rows = await db
		.select({ userId: groupMembers.userId })
		.from(groupMembers)
		.where(eq(groupMembers.groupId, groupId));
	return rows.map((r) => r.userId);
}

function generateCode(): string {
	return randomBytes(8).toString('base64url');
}

async function areFriends(currentUserId: string, targetId: string, token: string): Promise<boolean> {
	try {
		const resp = await fetch(`${config.friendsServiceUrl}/friends/status/${targetId}`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (resp.ok) {
			const data = (await resp.json()) as { status: string };
			return data.status === 'friends';
		}
	} catch {}
	return false;
}

// ─── Direct invite a user to a group ────────────────────────────

invitesRoutes.post('/:id/invites', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const body = await c.req.json().catch(() => ({}));
	const inviteeId = body?.userId ? String(body.userId) : '';
	if (!inviteeId) return c.json({ error: 'userId required' }, 400);
	if (inviteeId === me.userId) return c.json({ error: 'cannot invite yourself' }, 400);

	const role = await membership(id, me.userId);
	if (!role) return c.json({ error: 'forbidden' }, 403);

	const [g] = await db
		.select({ id: groups.id, name: groups.name, avatarUrl: groups.avatarUrl, invitePolicy: groups.invitePolicy })
		.from(groups).where(eq(groups.id, id)).limit(1);
	if (!g) return c.json({ error: 'group not found' }, 404);
	if (!canInvite(role, g.invitePolicy as InvitePolicy)) return c.json({ error: 'forbidden' }, 403);

	const already = await membership(id, inviteeId);
	if (already) return c.json({ error: 'already a member' }, 409);

	const [invitee] = await db
		.select({ id: userCache.id, username: userCache.username, privacyGroupInvite: userCache.privacyGroupInvite })
		.from(userCache).where(eq(userCache.id, inviteeId)).limit(1);
	if (!invitee) return c.json({ error: 'user not found' }, 404);

	// Honor the invitee's "who can invite me to groups" preference. The cached
	// value defaults to 'all' so unknown/legacy rows keep prior behavior.
	const policy = invitee.privacyGroupInvite ?? 'all';
	if (policy === 'nobody') {
		return c.json({ error: 'This user does not accept group invites' }, 403);
	}
	if (policy === 'friends') {
		const token = c.req.header('Authorization')?.slice(7) ?? '';
		const isFriend = await areFriends(me.userId, inviteeId, token);
		if (!isFriend) {
			return c.json({ error: 'This user only accepts group invites from friends' }, 403);
		}
	}

	const [me_] = await db
		.select({ username: userCache.username })
		.from(userCache).where(eq(userCache.id, me.userId)).limit(1);

	let invite;
	try {
		[invite] = await db.insert(groupInvites).values({
			groupId: id,
			inviterId: me.userId,
			inviteeId,
			status: 'pending',
		}).returning();
	} catch (err: any) {
		// Partial unique index on (group_id, invitee_id) WHERE status='pending'
		if (err?.code === '23505') return c.json({ error: 'invite already pending' }, 409);
		throw err;
	}

	void publishGroupInviteCreated({
		targetUserIds: [inviteeId],
		invite: {
			id: invite.id,
			groupId: id,
			groupName: g.name,
			groupAvatarUrl: g.avatarUrl,
			inviterId: me.userId,
			inviterUsername: me_?.username ?? '',
			createdAt: invite.createdAt.toISOString(),
		},
	});

	return c.json({ invite }, 201);
});

// ─── List my incoming invites ───────────────────────────────────

invitesRoutes.get('/invites/incoming', async (c) => {
	const me = c.get('user');

	const rows = await db
		.select({
			id: groupInvites.id,
			groupId: groupInvites.groupId,
			groupName: groups.name,
			groupAvatarUrl: groups.avatarUrl,
			inviterId: groupInvites.inviterId,
			inviterUsername: userCache.username,
			inviterDisplayName: userCache.displayName,
			createdAt: groupInvites.createdAt,
		})
		.from(groupInvites)
		.innerJoin(groups, eq(groupInvites.groupId, groups.id))
		.innerJoin(userCache, eq(groupInvites.inviterId, userCache.id))
		.where(and(eq(groupInvites.inviteeId, me.userId), eq(groupInvites.status, 'pending')))
		.orderBy(desc(groupInvites.createdAt));

	return c.json({ invites: rows });
});

// ─── Accept invite ──────────────────────────────────────────────

invitesRoutes.post('/invites/:inviteId/accept', async (c) => {
	const me = c.get('user');
	const inviteId = c.req.param('inviteId');

	const [invite] = await db
		.select().from(groupInvites)
		.where(eq(groupInvites.id, inviteId)).limit(1);
	if (!invite) return c.json({ error: 'invite not found' }, 404);
	if (invite.inviteeId !== me.userId) return c.json({ error: 'forbidden' }, 403);
	if (invite.status !== 'pending') return c.json({ error: 'invite already resolved' }, 409);

	await db.transaction(async (tx) => {
		await tx.update(groupInvites)
			.set({ status: 'accepted', respondedAt: new Date() })
			.where(eq(groupInvites.id, inviteId));
		await tx.insert(groupMembers).values({
			groupId: invite.groupId,
			userId: me.userId,
			role: 'member',
		}).onConflictDoNothing();
	});

	const [user] = await db
		.select({ id: userCache.id, username: userCache.username, displayName: userCache.displayName, avatarUrl: userCache.avatarUrl })
		.from(userCache).where(eq(userCache.id, me.userId)).limit(1);

	const memberIds = await listMemberIds(invite.groupId);

	void publishGroupMemberJoined({
		targetUserIds: memberIds,
		groupId: invite.groupId,
		member: {
			userId: me.userId,
			role: 'member',
			nickname: null,
			joinedAt: new Date().toISOString(),
			user: user ?? { id: me.userId, username: '', displayName: null, avatarUrl: null },
		},
	});
	void publishGroupInviteResponded({
		targetUserIds: [invite.inviterId],
		inviteId, groupId: invite.groupId, inviteeId: me.userId, status: 'accepted',
	});

	return c.json({ success: true, groupId: invite.groupId });
});

// ─── Decline invite ─────────────────────────────────────────────

invitesRoutes.post('/invites/:inviteId/decline', async (c) => {
	const me = c.get('user');
	const inviteId = c.req.param('inviteId');

	const [invite] = await db
		.select().from(groupInvites)
		.where(eq(groupInvites.id, inviteId)).limit(1);
	if (!invite) return c.json({ error: 'invite not found' }, 404);
	if (invite.inviteeId !== me.userId) return c.json({ error: 'forbidden' }, 403);
	if (invite.status !== 'pending') return c.json({ error: 'invite already resolved' }, 409);

	await db.update(groupInvites)
		.set({ status: 'declined', respondedAt: new Date() })
		.where(eq(groupInvites.id, inviteId));

	void publishGroupInviteResponded({
		targetUserIds: [invite.inviterId],
		inviteId, groupId: invite.groupId, inviteeId: me.userId, status: 'declined',
	});

	return c.json({ success: true });
});

// ─── Revoke invite (inviter or admin+) ──────────────────────────

invitesRoutes.delete('/invites/:inviteId', async (c) => {
	const me = c.get('user');
	const inviteId = c.req.param('inviteId');

	const [invite] = await db
		.select().from(groupInvites)
		.where(eq(groupInvites.id, inviteId)).limit(1);
	if (!invite) return c.json({ error: 'invite not found' }, 404);
	if (invite.status !== 'pending') return c.json({ error: 'invite already resolved' }, 409);

	const role = await membership(invite.groupId, me.userId);
	const isInviter = invite.inviterId === me.userId;
	if (!isInviter && (!role || !can(role, 'invite.revoke'))) return c.json({ error: 'forbidden' }, 403);

	await db.update(groupInvites)
		.set({ status: 'revoked', respondedAt: new Date() })
		.where(eq(groupInvites.id, inviteId));

	void publishGroupInviteResponded({
		targetUserIds: [invite.inviteeId],
		inviteId, groupId: invite.groupId, inviteeId: invite.inviteeId, status: 'revoked',
	});

	return c.json({ success: true });
});

// ─── Regenerate invite link code (admin+) ───────────────────────

invitesRoutes.post('/:id/invite-link/regenerate', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const role = await membership(id, me.userId);
	if (!role || !can(role, 'group.edit')) return c.json({ error: 'forbidden' }, 403);

	// Retry on rare unique-collision
	for (let attempt = 0; attempt < 3; attempt++) {
		const code = generateCode();
		try {
			await db.update(groups).set({ inviteCode: code, updatedAt: new Date() })
				.where(eq(groups.id, id));
			return c.json({ inviteCode: code });
		} catch (err: any) {
			if (err?.code !== '23505' || attempt === 2) throw err;
		}
	}
	return c.json({ error: 'could not generate code' }, 500);
});

// ─── Join via invite code ───────────────────────────────────────

invitesRoutes.post('/join/:code', async (c) => {
	const me = c.get('user');
	const code = c.req.param('code');

	const [g] = await db.select().from(groups).where(eq(groups.inviteCode, code)).limit(1);
	if (!g) return c.json({ error: 'invalid code' }, 404);

	const already = await membership(g.id, me.userId);
	if (already) return c.json({ groupId: g.id, alreadyMember: true });

	await db.insert(groupMembers).values({
		groupId: g.id,
		userId: me.userId,
		role: 'member',
	}).onConflictDoNothing();

	const [user] = await db
		.select({ id: userCache.id, username: userCache.username, displayName: userCache.displayName, avatarUrl: userCache.avatarUrl })
		.from(userCache).where(eq(userCache.id, me.userId)).limit(1);

	const memberIds = await listMemberIds(g.id);

	void publishGroupMemberJoined({
		targetUserIds: memberIds,
		groupId: g.id,
		member: {
			userId: me.userId,
			role: 'member',
			nickname: null,
			joinedAt: new Date().toISOString(),
			user: user ?? { id: me.userId, username: '', displayName: null, avatarUrl: null },
		},
	});

	return c.json({ groupId: g.id, alreadyMember: false });
});
