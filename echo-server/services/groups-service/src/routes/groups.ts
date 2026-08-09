import { Hono } from 'hono';
import { and, eq, desc, gt, inArray, ne, sql, count } from 'drizzle-orm';
import { authMiddleware, type AuthEnv } from '@echo/shared';
import { createDb } from '../db/index.js';
import { groups, groupMembers, groupMessages, userCache, groupChatReads } from '../db/schema.js';
import { config } from '../config.js';
import {
	can, canEditInfo,
	isValidInvitePolicy, isValidMessagePolicy, isValidPinPolicy, isValidEditInfoPolicy,
	type Role, type EditInfoPolicy,
} from '../permissions.js';
import {
	publishGroupCreated, publishGroupUpdated, publishGroupDeleted,
	publishGroupMemberJoined, publishGroupMemberLeft, publishGroupMemberRoleChanged,
} from '../nats.js';
import { log } from '../log.js';

const db = createDb(config.databaseUrl);

// Cap on how many groups a single user can own (create). Joining other people's
// groups is unbounded — this only limits groups you create yourself.
const MAX_GROUPS_PER_OWNER = 10;

export const groupsRoutes = new Hono<AuthEnv>();
groupsRoutes.use('*', authMiddleware(config.jwtSecret));

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

async function userSummary(id: string) {
	const [u] = await db
		.select({ id: userCache.id, username: userCache.username, displayName: userCache.displayName, avatarUrl: userCache.avatarUrl })
		.from(userCache)
		.where(eq(userCache.id, id))
		.limit(1);
	return u ?? null;
}

// ─── List groups for current user ───────────────────────────────

groupsRoutes.get('/', async (c) => {
	const me = c.get('user');
	const rows = await db
		.select({
			id: groups.id,
			name: groups.name,
			description: groups.description,
			avatarUrl: groups.avatarUrl,
			ownerId: groups.ownerId,
			isPublic: groups.isPublic,
			createdAt: groups.createdAt,
			role: groupMembers.role,
		})
		.from(groupMembers)
		.innerJoin(groups, eq(groupMembers.groupId, groups.id))
		.where(eq(groupMembers.userId, me.userId))
		.orderBy(desc(groups.createdAt));

	const groupIds = rows.map((r) => r.id);

	// Per-group latest message + unread count. Without these the client falls
	// back to the group description in the sidebar and shows no timestamp until
	// a WS event fires — meaning on first load every group looks "stale."
	//
	// Latest message: one parallel SELECT per group, ordered by (group_id,
	// created_at) which is already indexed. Cheaper than fetching all messages
	// and grouping in app code, simpler than a DISTINCT ON CTE.
	const fetchLatest = (gid: string) =>
		db
			.select({
				id: groupMessages.id,
				groupId: groupMessages.groupId,
				authorId: groupMessages.authorId,
				authorUsername: userCache.username,
				authorDisplayName: userCache.displayName,
				content: groupMessages.content,
				attachments: groupMessages.attachments,
				createdAt: groupMessages.createdAt,
				systemKind: groupMessages.systemKind,
			})
			.from(groupMessages)
			.innerJoin(userCache, eq(groupMessages.authorId, userCache.id))
			.where(eq(groupMessages.groupId, gid))
			.orderBy(desc(groupMessages.createdAt))
			.limit(1)
			.then((rows) => ({ groupId: gid, message: rows[0] ?? null }));

	const [latestMessages, myReads, unreadCounts] = await Promise.all([
		Promise.all(groupIds.map(fetchLatest)),
		groupIds.length === 0
			? []
			: db
					.select({
						groupId: groupChatReads.groupId,
						lastReadAt: groupChatReads.lastReadAt,
					})
					.from(groupChatReads)
					.where(
						and(
							eq(groupChatReads.userId, me.userId),
							inArray(groupChatReads.groupId, groupIds),
						),
					),
		groupIds.length === 0
			? []
			: db
					.select({
						groupId: groupMessages.groupId,
						count: count(),
					})
					.from(groupMessages)
					.innerJoin(
						groupChatReads,
						and(
							eq(groupChatReads.groupId, groupMessages.groupId),
							eq(groupChatReads.userId, me.userId),
							gt(groupMessages.createdAt, groupChatReads.lastReadAt),
						),
					)
					.where(
						and(
							inArray(groupMessages.groupId, groupIds),
							ne(groupMessages.authorId, me.userId),
						),
					)
					.groupBy(groupMessages.groupId),
	]);

	const lastMessageMap = new Map(latestMessages.map((r) => [r.groupId, r.message]));
	const myReadMap = new Map(myReads.map((r) => [r.groupId, r.lastReadAt]));
	const unreadMap = new Map(unreadCounts.map((r) => [r.groupId, r.count]));

	const enriched = rows.map((g) => {
		const msg = lastMessageMap.get(g.id);
		const lastMessage = msg
			? {
					id: msg.id,
					groupId: msg.groupId,
					authorId: msg.authorId,
					authorUsername: msg.authorUsername,
					authorDisplayName: msg.authorDisplayName,
					content: msg.content,
					attachments: (msg.attachments as unknown[]) ?? [],
					createdAt: msg.createdAt.toISOString(),
					systemKind: msg.systemKind,
				}
			: null;
		// Group "read by recipient" isn't tracked per-member yet (we only know
		// my own lastReadAt, which says nothing about other members), so the
		// sidebar omits the ✓/✓✓ icon for groups. Field shipped as null today
		// so a future per-member tracker can drop in without an API rename.
		const myLastReadAt = myReadMap.get(g.id) ?? null;
		return {
			...g,
			lastMessage,
			unreadCount: Number(unreadMap.get(g.id) ?? 0),
			isLastMessageRead: null,
			lastReadAt: myLastReadAt ? myLastReadAt.toISOString() : null,
		};
	});

	return c.json({ groups: enriched });
});

// ─── Create group ───────────────────────────────────────────────

groupsRoutes.post('/', async (c) => {
	const me = c.get('user');
	const body = await c.req.json().catch(() => ({}));
	const name = (body?.name ?? '').toString().trim();
	if (!name) return c.json({ error: 'name is required' }, 400);
	if (name.length > 80) return c.json({ error: 'name too long (max 80)' }, 400);

	const [{ owned }] = await db
		.select({ owned: count() })
		.from(groups)
		.where(eq(groups.ownerId, me.userId));
	if (Number(owned) >= MAX_GROUPS_PER_OWNER) {
		return c.json({ error: `group limit reached (you can create at most ${MAX_GROUPS_PER_OWNER})` }, 409);
	}

	const description = body?.description ? String(body.description).slice(0, 500) : null;
	const isPublic = !!body?.isPublic;

	const [g] = await db.insert(groups).values({
		name,
		description,
		ownerId: me.userId,
		isPublic,
	}).returning();

	await db.insert(groupMembers).values({
		groupId: g.id,
		userId: me.userId,
		role: 'owner',
	});

	const summary = {
		id: g.id, name: g.name, description: g.description, avatarUrl: g.avatarUrl,
		ownerId: g.ownerId, isPublic: g.isPublic, createdAt: g.createdAt.toISOString(),
	};

	void publishGroupCreated({ targetUserIds: [me.userId], group: summary, memberIds: [me.userId] });

	return c.json({ group: { ...summary, role: 'owner' as const } }, 201);
});

// ─── Get group details (members + your role) ────────────────────

groupsRoutes.get('/:id', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const role = await membership(id, me.userId);
	if (!role) return c.json({ error: 'not a member' }, 403);

	const [g] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
	if (!g) return c.json({ error: 'group not found' }, 404);

	const members = await db
		.select({
			userId: groupMembers.userId,
			role: groupMembers.role,
			nickname: groupMembers.nickname,
			joinedAt: groupMembers.joinedAt,
			username: userCache.username,
			displayName: userCache.displayName,
			avatarUrl: userCache.avatarUrl,
			isOnline: userCache.isOnline,
		})
		.from(groupMembers)
		.innerJoin(userCache, eq(groupMembers.userId, userCache.id))
		.where(eq(groupMembers.groupId, id));

	return c.json({
		group: {
			id: g.id, name: g.name, description: g.description, avatarUrl: g.avatarUrl,
			ownerId: g.ownerId, isPublic: g.isPublic, inviteCode: g.inviteCode,
			invitePolicy: g.invitePolicy,
			messagePolicy: g.messagePolicy,
			pinPolicy: g.pinPolicy,
			editInfoPolicy: g.editInfoPolicy,
			historyVisible: g.historyVisible,
			createdAt: g.createdAt.toISOString(),
			role,
		},
		members,
	});
});

// ─── Update group ───────────────────────────────────────────────

groupsRoutes.patch('/:id', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const role = await membership(id, me.userId);
	if (!role) return c.json({ error: 'forbidden' }, 403);

	const [current] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
	if (!current) return c.json({ error: 'group not found' }, 404);

	const body = await c.req.json().catch(() => ({}));
	const patch: Record<string, unknown> = { updatedAt: new Date() };

	const wantsEditInfo = (
		typeof body?.name === 'string' && body.name.trim() ||
		body?.description !== undefined ||
		body?.avatarUrl !== undefined
	);
	if (wantsEditInfo && !canEditInfo(role, current.editInfoPolicy as EditInfoPolicy)) {
		return c.json({ error: 'forbidden' }, 403);
	}

	if (typeof body?.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 80);
	if (body?.description !== undefined) patch.description = body.description ? String(body.description).slice(0, 500) : null;
	if (body?.avatarUrl !== undefined) patch.avatarUrl = body.avatarUrl ? String(body.avatarUrl) : null;
	if (body?.isPublic !== undefined) {
		if (role !== 'owner') return c.json({ error: 'only owner can change visibility' }, 403);
		patch.isPublic = !!body.isPublic;
	}
	if (body?.invitePolicy !== undefined) {
		if (role !== 'owner') return c.json({ error: 'only owner can change invite policy' }, 403);
		if (!isValidInvitePolicy(body.invitePolicy)) return c.json({ error: 'invalid invitePolicy' }, 400);
		patch.invitePolicy = body.invitePolicy;
	}
	if (body?.messagePolicy !== undefined) {
		if (role !== 'owner') return c.json({ error: 'only owner can change message policy' }, 403);
		if (!isValidMessagePolicy(body.messagePolicy)) return c.json({ error: 'invalid messagePolicy' }, 400);
		patch.messagePolicy = body.messagePolicy;
	}
	if (body?.pinPolicy !== undefined) {
		if (role !== 'owner') return c.json({ error: 'only owner can change pin policy' }, 403);
		if (!isValidPinPolicy(body.pinPolicy)) return c.json({ error: 'invalid pinPolicy' }, 400);
		patch.pinPolicy = body.pinPolicy;
	}
	if (body?.editInfoPolicy !== undefined) {
		if (role !== 'owner') return c.json({ error: 'only owner can change edit-info policy' }, 403);
		if (!isValidEditInfoPolicy(body.editInfoPolicy)) return c.json({ error: 'invalid editInfoPolicy' }, 400);
		patch.editInfoPolicy = body.editInfoPolicy;
	}
	if (body?.historyVisible !== undefined) {
		if (role !== 'owner') return c.json({ error: 'only owner can change history visibility' }, 403);
		patch.historyVisible = !!body.historyVisible;
	}

	const [updated] = await db.update(groups).set(patch).where(eq(groups.id, id)).returning();
	if (!updated) return c.json({ error: 'group not found' }, 404);

	const memberIds = await listMemberIds(id);
	void publishGroupUpdated({
		targetUserIds: memberIds,
		groupId: id,
		patch: {
			name: typeof patch.name === 'string' ? patch.name : undefined,
			description: 'description' in patch ? (patch.description as string | null) : undefined,
			avatarUrl: 'avatarUrl' in patch ? (patch.avatarUrl as string | null) : undefined,
			isPublic: 'isPublic' in patch ? (patch.isPublic as boolean) : undefined,
			invitePolicy: 'invitePolicy' in patch ? (patch.invitePolicy as 'owner' | 'admins' | 'everyone') : undefined,
			messagePolicy: 'messagePolicy' in patch ? (patch.messagePolicy as 'owner' | 'admins' | 'everyone') : undefined,
			pinPolicy: 'pinPolicy' in patch ? (patch.pinPolicy as 'owner' | 'admins' | 'everyone') : undefined,
			editInfoPolicy: 'editInfoPolicy' in patch ? (patch.editInfoPolicy as 'owner' | 'admins') : undefined,
			historyVisible: 'historyVisible' in patch ? (patch.historyVisible as boolean) : undefined,
		},
	});

	return c.json({ group: updated });
});

// ─── Group avatar ───────────────────────────────────────────────

const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const AVATAR_MAX_SIZE = 5 * 1024 * 1024;

/**
 * A stored blob is served from `/blobs/files/<sha256>.<ext>`, so the hash a
 * grant is keyed by can be read straight back off the URL. That is why a group
 * needs no `avatar_hash` column: it keeps exactly one picture, and the URL of
 * that picture already says which blob to revoke when it is replaced.
 */
function hashFromBlobUrl(url: string | null): string | null {
	if (!url) return null;
	const m = /\/blobs\/files\/([a-f0-9]{64})\./i.exec(url);
	return m ? m[1].toLowerCase() : null;
}

/**
 * Drop this group's claim on a blob. Fire-and-forget on purpose: the picture
 * has already been replaced by the time we get here, and a grant that outlives
 * it costs disk, not correctness — the blob service garbage-collects orphans.
 */
async function revokeAvatarGrant(groupId: string, hash: string, authorization: string) {
	await fetch(`${config.blobServiceUrl}/blobs/grants`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json', Authorization: authorization },
		body: JSON.stringify({ scopeType: 'avatar', scopeId: groupId, hashes: [hash] }),
	}).catch((err) => log.warn({ err, groupId, hash }, 'failed to revoke old group avatar grant'));
}

/** Applies a new avatar URL, tells everyone, and answers with the fresh group. */
async function commitAvatar(groupId: string, avatarUrl: string | null) {
	const [updated] = await db
		.update(groups)
		.set({ avatarUrl, updatedAt: new Date() })
		.where(eq(groups.id, groupId))
		.returning();

	if (updated) {
		const memberIds = await listMemberIds(groupId);
		void publishGroupUpdated({ targetUserIds: memberIds, groupId, patch: { avatarUrl } });
	}

	return updated;
}

// Upload (or replace) the group picture — proxies the file to blob-service the
// same way a user avatar does. A group keeps one picture: the previous blob's
// grant is revoked as soon as the new URL is stored.
groupsRoutes.post('/:id/avatar', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const authorization = c.req.header('Authorization')!;

	const role = await membership(id, me.userId);
	if (!role) return c.json({ error: 'forbidden' }, 403);

	const [current] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
	if (!current) return c.json({ error: 'group not found' }, 404);
	if (!canEditInfo(role, current.editInfoPolicy as EditInfoPolicy)) {
		return c.json({ error: 'forbidden' }, 403);
	}

	const formData = await c.req.formData();
	const file = formData.get('avatar');
	if (!file || !(file instanceof File)) return c.json({ error: 'No file provided' }, 400);
	if (!AVATAR_TYPES.includes(file.type)) {
		return c.json({ error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF, AVIF' }, 400);
	}
	if (file.size > AVATAR_MAX_SIZE) return c.json({ error: 'File too large. Max 5MB' }, 400);

	const blobForm = new FormData();
	blobForm.append('files', file);
	blobForm.append('scopeType', 'avatar');
	blobForm.append('scopeId', id);

	const blobResp = await fetch(`${config.blobServiceUrl}/blobs/upload`, {
		method: 'POST',
		headers: { Authorization: authorization },
		body: blobForm,
	});

	if (!blobResp.ok) {
		const err = await blobResp.json().catch(() => ({})) as { error?: string };
		return c.json({ error: err.error ?? 'Upload failed' }, blobResp.status as never);
	}

	const blobData = await blobResp.json() as { blobs: { url: string; hash: string }[] };
	const blob = blobData.blobs[0];
	if (!blob) return c.json({ error: 'Upload failed' }, 500);

	const updated = await commitAvatar(id, blob.url);
	if (!updated) return c.json({ error: 'group not found' }, 404);

	// Only after the swap has been recorded, and never when the new picture is
	// byte-identical to the old one — deduplication hands back the same hash,
	// and revoking it would delete the picture that was just set.
	const previous = hashFromBlobUrl(current.avatarUrl);
	if (previous && previous !== blob.hash) await revokeAvatarGrant(id, previous, authorization);

	return c.json({ group: updated });
});

// Remove the group picture and let go of the blob behind it.
groupsRoutes.delete('/:id/avatar', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const authorization = c.req.header('Authorization')!;

	const role = await membership(id, me.userId);
	if (!role) return c.json({ error: 'forbidden' }, 403);

	const [current] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
	if (!current) return c.json({ error: 'group not found' }, 404);
	if (!canEditInfo(role, current.editInfoPolicy as EditInfoPolicy)) {
		return c.json({ error: 'forbidden' }, 403);
	}

	const updated = await commitAvatar(id, null);
	if (!updated) return c.json({ error: 'group not found' }, 404);

	const previous = hashFromBlobUrl(current.avatarUrl);
	if (previous) await revokeAvatarGrant(id, previous, authorization);

	return c.json({ group: updated });
});

// ─── Delete group (owner only) ──────────────────────────────────

groupsRoutes.delete('/:id', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const role = await membership(id, me.userId);
	if (!role || !can(role, 'group.delete')) return c.json({ error: 'forbidden' }, 403);

	const memberIds = await listMemberIds(id);
	await db.delete(groups).where(eq(groups.id, id));

	void publishGroupDeleted({ targetUserIds: memberIds, groupId: id });

	return c.json({ success: true });
});

// ─── Transfer ownership (owner only) ────────────────────────────

groupsRoutes.post('/:id/transfer', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const body = await c.req.json().catch(() => ({}));
	const newOwnerId = body?.newOwnerId ? String(body.newOwnerId) : '';
	if (!newOwnerId) return c.json({ error: 'newOwnerId required' }, 400);

	const role = await membership(id, me.userId);
	if (!role || !can(role, 'group.transfer')) return c.json({ error: 'forbidden' }, 403);
	if (newOwnerId === me.userId) return c.json({ error: 'already owner' }, 400);

	const targetRole = await membership(id, newOwnerId);
	if (!targetRole) return c.json({ error: 'target is not a member' }, 400);

	await db.transaction(async (tx) => {
		await tx.update(groupMembers)
			.set({ role: 'admin' })
			.where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, me.userId)));
		await tx.update(groupMembers)
			.set({ role: 'owner' })
			.where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, newOwnerId)));
		await tx.update(groups)
			.set({ ownerId: newOwnerId, updatedAt: new Date() })
			.where(eq(groups.id, id));
	});

	const memberIds = await listMemberIds(id);
	void publishGroupMemberRoleChanged({ targetUserIds: memberIds, groupId: id, userId: me.userId, role: 'admin' });
	void publishGroupMemberRoleChanged({ targetUserIds: memberIds, groupId: id, userId: newOwnerId, role: 'owner' });
	void publishGroupUpdated({ targetUserIds: memberIds, groupId: id, patch: { ownerId: newOwnerId } });

	return c.json({ success: true });
});

// ─── List members ───────────────────────────────────────────────

groupsRoutes.get('/:id/members', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const role = await membership(id, me.userId);
	if (!role) return c.json({ error: 'not a member' }, 403);

	const members = await db
		.select({
			userId: groupMembers.userId,
			role: groupMembers.role,
			nickname: groupMembers.nickname,
			joinedAt: groupMembers.joinedAt,
			username: userCache.username,
			displayName: userCache.displayName,
			avatarUrl: userCache.avatarUrl,
			isOnline: userCache.isOnline,
		})
		.from(groupMembers)
		.innerJoin(userCache, eq(groupMembers.userId, userCache.id))
		.where(eq(groupMembers.groupId, id))
		.orderBy(desc(groupMembers.joinedAt));

	return c.json({ members });
});

// ─── Update member (owner: role; self: nickname) ────────────────

groupsRoutes.patch('/:id/members/:userId', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const targetId = c.req.param('userId');
	const body = await c.req.json().catch(() => ({}));

	const myRole = await membership(id, me.userId);
	if (!myRole) return c.json({ error: 'not a member' }, 403);

	const targetRole = await membership(id, targetId);
	if (!targetRole) return c.json({ error: 'target is not a member' }, 404);

	const updates: Record<string, unknown> = {};

	if (body?.role !== undefined) {
		if (!can(myRole, 'member.change_role')) return c.json({ error: 'forbidden' }, 403);
		const next = String(body.role) as Role;
		if (next === 'owner') return c.json({ error: 'use /transfer to set owner' }, 400);
		if (next !== 'admin' && next !== 'member') return c.json({ error: 'invalid role' }, 400);
		if (targetRole === 'owner') return c.json({ error: 'cannot demote owner' }, 400);
		updates.role = next;
	}

	if (body?.nickname !== undefined) {
		if (targetId !== me.userId && !can(myRole, 'group.edit')) return c.json({ error: 'forbidden' }, 403);
		updates.nickname = body.nickname ? String(body.nickname).slice(0, 32) : null;
	}

	if (Object.keys(updates).length === 0) return c.json({ error: 'nothing to update' }, 400);

	await db.update(groupMembers)
		.set(updates)
		.where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, targetId)));

	const memberIds = await listMemberIds(id);
	if ('role' in updates) {
		void publishGroupMemberRoleChanged({
			targetUserIds: memberIds, groupId: id, userId: targetId, role: updates.role as Role,
		});
	}

	return c.json({ success: true });
});

// ─── Kick or self-leave ─────────────────────────────────────────

groupsRoutes.delete('/:id/members/:userId', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const targetId = c.req.param('userId');

	const myRole = await membership(id, me.userId);
	if (!myRole) return c.json({ error: 'not a member' }, 403);

	const targetRole = await membership(id, targetId);
	if (!targetRole) return c.json({ error: 'target is not a member' }, 404);

	const isSelf = targetId === me.userId;
	if (!isSelf && !can(myRole, 'member.kick')) return c.json({ error: 'forbidden' }, 403);
	if (targetRole === 'owner') return c.json({ error: 'owner must transfer ownership before leaving' }, 400);
	// Admins can't kick other admins (only owner can demote+kick)
	if (!isSelf && targetRole === 'admin' && myRole !== 'owner') return c.json({ error: 'only owner can remove admins' }, 403);

	const memberIdsBefore = await listMemberIds(id);

	await db.delete(groupMembers)
		.where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, targetId)));
	await db.delete(groupChatReads)
		.where(and(eq(groupChatReads.groupId, id), eq(groupChatReads.userId, targetId)));

	void publishGroupMemberLeft({
		targetUserIds: memberIdsBefore, groupId: id, userId: targetId, kicked: !isSelf,
	});

	return c.json({ success: true });
});

// Aggregate counts for the group info page. Mirrors /personal-chats/:id/stats:
// scans group_messages.attachments JSON for mime-type buckets and joins on the
// links sidecar table for the link count. GIFs split out from photos.
groupsRoutes.get('/:id/stats', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');

	const role = await membership(id, me.userId);
	if (!role) return c.json({ error: 'not a member' }, 403);

	const result = await db.execute(sql`
		SELECT
			(SELECT COUNT(*)::int FROM group_messages WHERE group_id = ${id}) AS messages,
			(SELECT COUNT(*)::int FROM group_message_links WHERE group_id = ${id}) AS links,
			COALESCE(SUM(CASE WHEN att->>'mimeType' LIKE 'image/%' AND att->>'mimeType' <> 'image/gif' THEN 1 ELSE 0 END), 0)::int AS photos,
			COALESCE(SUM(CASE WHEN att->>'mimeType' = 'image/gif' THEN 1 ELSE 0 END), 0)::int AS gifs,
			COALESCE(SUM(CASE WHEN att->>'mimeType' LIKE 'video/%' THEN 1 ELSE 0 END), 0)::int AS videos,
			-- Recorded voice notes carry a voice payload; everything else in the
			-- audio range is an upload. The files bucket counts neither.
			COALESCE(SUM(CASE WHEN att->>'mimeType' LIKE 'audio/%' AND jsonb_typeof(att->'voice') = 'object' THEN 1 ELSE 0 END), 0)::int AS voice_messages,
			COALESCE(SUM(CASE WHEN att->>'mimeType' LIKE 'audio/%' AND jsonb_typeof(att->'voice') IS DISTINCT FROM 'object' THEN 1 ELSE 0 END), 0)::int AS audio,
			COALESCE(SUM(CASE WHEN att->>'mimeType' NOT LIKE 'image/%' AND att->>'mimeType' NOT LIKE 'video/%' AND att->>'mimeType' NOT LIKE 'audio/%' THEN 1 ELSE 0 END), 0)::int AS files
		FROM group_messages gm
		LEFT JOIN LATERAL jsonb_array_elements(gm.attachments) att ON TRUE
		WHERE gm.group_id = ${id}
	`);

	const row = (result as unknown as Array<{
		messages: number;
		links: number;
		photos: number;
		videos: number;
		files: number;
		gifs: number;
		audio: number;
		voice_messages: number;
	}>)[0];

	return c.json({
		messages: row?.messages ?? 0,
		links: row?.links ?? 0,
		photos: row?.photos ?? 0,
		videos: row?.videos ?? 0,
		files: row?.files ?? 0,
		gifs: row?.gifs ?? 0,
		audio: row?.audio ?? 0,
		voiceMessages: row?.voice_messages ?? 0,
	});
});

// Paginated media listing for a group, mirrors /personal-chats/:id/media. The
// `kind` query selects which attachment family (or links) to return; cursor
// pagination uses `${pgTimestamp}|${ord}` for attachments and the link-table
// id for links.
groupsRoutes.get('/:id/media', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const kind = c.req.query('kind') ?? 'photos';
	const cursor = c.req.query('cursor');
	const limit = Math.min(Number(c.req.query('limit')) || 30, 100);

	if (
		kind !== 'photos' && kind !== 'videos' && kind !== 'gifs' &&
		kind !== 'audio' && kind !== 'files' && kind !== 'links'
	) {
		return c.json({ error: 'Invalid kind' }, 400);
	}

	const role = await membership(id, me.userId);
	if (!role) return c.json({ error: 'not a member' }, 403);

	if (kind === 'links') {
		let cursorId: number | null = null;
		if (cursor) cursorId = Number(cursor) || null;

		const cursorFilter = cursorId !== null ? sql`AND l.id < ${cursorId}` : sql.empty();

		let linkResult;
		try {
			linkResult = await db.execute(sql`
				SELECT l.id, l.message_id, l.url, l.created_at
				FROM group_message_links l
				WHERE l.group_id = ${id}
					${cursorFilter}
				ORDER BY l.created_at DESC, l.id DESC
				LIMIT ${limit + 1}
			`);
		} catch (err) {
			log.error({ err }, 'links query failed');
			return c.json({ error: 'Failed to load links' }, 500);
		}

		const linkRows = linkResult as unknown as Array<{
			id: number;
			message_id: string;
			url: string;
			created_at: Date | string;
		}>;

		const hasMore = linkRows.length > limit;
		if (hasMore) linkRows.pop();

		const tsToStr = (t: Date | string): string =>
			t instanceof Date ? t.toISOString() : t;

		const items = linkRows.map((r) => ({
			id: r.id,
			messageId: r.message_id,
			createdAt: tsToStr(r.created_at),
			url: r.url,
		}));

		const last = linkRows[linkRows.length - 1];
		const nextCursor = hasMore && last ? String(last.id) : null;

		return c.json({ items, hasMore, nextCursor });
	}

	// `files` is documents only — audio is its own kind, matching the stats
	// buckets and how the chat renders audio inline.
	const mimeFilter = kind === 'photos'
		? sql`att.value->>'mimeType' LIKE 'image/%' AND att.value->>'mimeType' <> 'image/gif'`
		: kind === 'gifs'
			? sql`att.value->>'mimeType' = 'image/gif'`
			: kind === 'videos'
				? sql`att.value->>'mimeType' LIKE 'video/%'`
				: kind === 'audio'
					? sql`att.value->>'mimeType' LIKE 'audio/%' AND jsonb_typeof(att.value->'voice') IS DISTINCT FROM 'object'`
					: sql`att.value->>'mimeType' NOT LIKE 'image/%' AND att.value->>'mimeType' NOT LIKE 'video/%' AND att.value->>'mimeType' NOT LIKE 'audio/%'`;

	let cursorTimestamp: string | null = null;
	let cursorOrd: number | null = null;
	if (cursor) {
		const sep = cursor.lastIndexOf('|');
		if (sep > 0) {
			const tsPart = cursor.slice(0, sep).trim();
			const ord = Number(cursor.slice(sep + 1));
			if (tsPart && Number.isFinite(ord)) {
				cursorTimestamp = tsPart;
				cursorOrd = ord;
			}
		}
	}

	const cursorFilter = cursorTimestamp !== null && cursorOrd !== null
		? sql`AND (gm.created_at < ${cursorTimestamp}::timestamp OR (gm.created_at = ${cursorTimestamp}::timestamp AND att.ord > ${cursorOrd}))`
		: sql.empty();

	let result;
	try {
		result = await db.execute(sql`
			SELECT
				gm.id AS message_id,
				gm.created_at AS created_at,
				att.ord AS ord,
				att.value AS attachment
			FROM group_messages gm
			CROSS JOIN LATERAL jsonb_array_elements(gm.attachments) WITH ORDINALITY att(value, ord)
			WHERE gm.group_id = ${id}
				AND (${mimeFilter})
				${cursorFilter}
			ORDER BY gm.created_at DESC, att.ord ASC
			LIMIT ${limit + 1}
		`);
	} catch (err) {
		log.error({ err }, 'media query failed');
		return c.json({ error: 'Failed to load media' }, 500);
	}

	const rows = result as unknown as Array<{
		message_id: string;
		created_at: Date | string;
		ord: number | bigint | string;
		attachment: { id: string; url: string; filename: string; mimeType: string; size: number };
	}>;

	const hasMore = rows.length > limit;
	if (hasMore) rows.pop();

	const tsToString = (t: Date | string): string =>
		t instanceof Date ? t.toISOString() : t;

	const items = rows.map((r) => ({
		messageId: r.message_id,
		createdAt: tsToString(r.created_at),
		attachment: r.attachment,
	}));

	const last = rows[rows.length - 1];
	const nextCursor = hasMore && last
		? `${tsToString(last.created_at)}|${Number(last.ord)}`
		: null;

	return c.json({ items, hasMore, nextCursor });
});
