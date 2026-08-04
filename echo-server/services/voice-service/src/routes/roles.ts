import { Hono } from 'hono';
import { and, asc, desc, eq, inArray, count } from 'drizzle-orm';
import { authMiddleware, type AuthEnv, VOICE_PERMS } from '@echo/shared';
import { createDb } from '../db/index.js';
import {
	voiceRoles, voiceRoleMembers, voiceChannelRoleAccess, voiceChannels,
	groupMembersMirror, userCache,
} from '../db/schema.js';
import { config } from '../config.js';
import { groupVoicePerms, groupMemberIds } from '../permissions.js';
import {
	publishVoiceRoleCreated, publishVoiceRoleUpdated, publishVoiceRoleDeleted,
	publishVoiceRoleMembersChanged, publishVoiceChannelAccessChanged,
} from '../nats.js';
import { log } from '../log.js';

const db = createDb(config.databaseUrl);

// Cap on distinct roles per group. Since a channel's access allowlist can only
// reference roles that exist in the group, this also bounds any one channel's
// allowlist at the same number.
const MAX_ROLES_PER_GROUP = 10;

export const rolesRoutes = new Hono<AuthEnv>();
rolesRoutes.use('*', authMiddleware(config.jwtSecret));

// All permission bits OR'd together — used to validate the permissions field.
const ALL_PERMS_MASK =
	VOICE_PERMS.CONNECT | VOICE_PERMS.SPEAK | VOICE_PERMS.MANAGE_CHANNELS
	| VOICE_PERMS.MANAGE_ROLES | VOICE_PERMS.CAN_SHARE;

function toRoleSummary(r: typeof voiceRoles.$inferSelect) {
	return {
		id: r.id,
		groupId: r.groupId,
		name: r.name,
		color: r.color,
		permissions: r.permissions,
		position: r.position,
		createdBy: r.createdBy,
		createdAt: r.createdAt.toISOString(),
	};
}

// ─── List roles in a group ──────────────────────────────────────
// Members can read the role list (so the UI can show "you're in role X");
// only managers can edit. Each role row carries its member ids inline so the
// page can render the chip list without N+1 follow-ups.

rolesRoutes.get('/roles', async (c) => {
	const me = c.get('user');
	const groupId = c.req.query('groupId');
	if (!groupId) return c.json({ error: 'groupId required' }, 400);

	const perms = await groupVoicePerms(groupId, me.userId);
	if (!perms.role) return c.json({ error: 'forbidden' }, 403);

	const roles = await db
		.select()
		.from(voiceRoles)
		.where(eq(voiceRoles.groupId, groupId))
		.orderBy(asc(voiceRoles.position), asc(voiceRoles.createdAt));

	const roleIds = roles.map((r) => r.id);
	const memberRows = roleIds.length === 0
		? []
		: await db
			.select({
				roleId: voiceRoleMembers.roleId,
				userId: voiceRoleMembers.userId,
				username: userCache.username,
				displayName: userCache.displayName,
				avatarUrl: userCache.avatarUrl,
			})
			.from(voiceRoleMembers)
			.leftJoin(userCache, eq(userCache.id, voiceRoleMembers.userId))
			.where(inArray(voiceRoleMembers.roleId, roleIds));

	const membersByRole = new Map<string, typeof memberRows>();
	for (const row of memberRows) {
		const list = membersByRole.get(row.roleId) ?? [];
		list.push(row);
		membersByRole.set(row.roleId, list);
	}

	return c.json({
		roles: roles.map((r) => ({
			...toRoleSummary(r),
			members: (membersByRole.get(r.id) ?? []).map((m) => ({
				userId: m.userId,
				username: m.username ?? m.userId,
				displayName: m.displayName,
				avatarUrl: m.avatarUrl,
			})),
		})),
		canManage: perms.manageRoles,
	});
});

// ─── Create role ────────────────────────────────────────────────

rolesRoutes.post('/roles', async (c) => {
	const me = c.get('user');
	const body = await c.req.json().catch(() => ({}));
	const groupId = String(body?.groupId ?? '');
	const name = String(body?.name ?? '').trim();
	const color = body?.color == null ? null : String(body.color).trim() || null;
	const permissions = Number.isInteger(body?.permissions) ? body.permissions & ALL_PERMS_MASK : 0;

	if (!groupId || !name) return c.json({ error: 'groupId and name required' }, 400);
	if (name.length > 64) return c.json({ error: 'name too long' }, 400);

	const perms = await groupVoicePerms(groupId, me.userId);
	if (!perms.role) return c.json({ error: 'forbidden' }, 403);
	if (!perms.manageRoles) return c.json({ error: 'forbidden' }, 403);

	const [{ total }] = await db
		.select({ total: count() })
		.from(voiceRoles)
		.where(eq(voiceRoles.groupId, groupId));
	if (Number(total) >= MAX_ROLES_PER_GROUP) {
		return c.json({ error: `role limit reached (max ${MAX_ROLES_PER_GROUP})` }, 409);
	}

	// Append at the bottom (highest position + 1). Existing rows untouched.
	const existingRows = await db
		.select({ position: voiceRoles.position })
		.from(voiceRoles)
		.where(eq(voiceRoles.groupId, groupId))
		.orderBy(desc(voiceRoles.position))
		.limit(1);
	const position = (existingRows[0]?.position ?? -1) + 1;

	try {
		const [row] = await db.insert(voiceRoles).values({
			groupId,
			name,
			color,
			permissions,
			position,
			createdBy: me.userId,
		}).returning();

		const targetUserIds = await groupMemberIds(groupId);
		publishVoiceRoleCreated({
			targetUserIds,
			role: toRoleSummary(row),
		}).catch((err) => {
			log.warn({ err }, 'publishVoiceRoleCreated failed');
		});

		return c.json({ role: { ...toRoleSummary(row), members: [] } }, 201);
	} catch {
		return c.json({ error: 'role name already exists' }, 409);
	}
});

// ─── Update role ────────────────────────────────────────────────

rolesRoutes.patch('/roles/:id', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const body = await c.req.json().catch(() => ({}));

	const [role] = await db.select().from(voiceRoles).where(eq(voiceRoles.id, id)).limit(1);
	if (!role) return c.json({ error: 'not found' }, 404);

	const perms = await groupVoicePerms(role.groupId, me.userId);
	if (!perms.manageRoles) return c.json({ error: 'forbidden' }, 403);

	const patch: Partial<{ name: string; color: string | null; permissions: number; position: number }> = {};
	if (body?.name !== undefined) {
		const name = String(body.name).trim();
		if (!name) return c.json({ error: 'name cannot be empty' }, 400);
		if (name.length > 64) return c.json({ error: 'name too long' }, 400);
		patch.name = name;
	}
	if (body?.color !== undefined) {
		patch.color = body.color == null ? null : String(body.color).trim() || null;
	}
	if (body?.permissions !== undefined) {
		const p = Number(body.permissions);
		if (!Number.isInteger(p) || p < 0) return c.json({ error: 'invalid permissions' }, 400);
		patch.permissions = p & ALL_PERMS_MASK;
	}
	if (body?.position !== undefined) {
		const pos = Number(body.position);
		if (!Number.isInteger(pos) || pos < 0) return c.json({ error: 'invalid position' }, 400);
		patch.position = pos;
	}
	if (Object.keys(patch).length === 0) return c.json({ error: 'nothing to update' }, 400);

	try {
		await db.update(voiceRoles).set(patch).where(eq(voiceRoles.id, id));
	} catch {
		return c.json({ error: 'role name already exists' }, 409);
	}

	const targetUserIds = await groupMemberIds(role.groupId);
	publishVoiceRoleUpdated({
		targetUserIds,
		groupId: role.groupId,
		roleId: id,
		patch,
	}).catch((err) => {
		log.warn({ err }, 'publishVoiceRoleUpdated failed');
	});

	return c.json({ success: true, patch });
});

// ─── Delete role ────────────────────────────────────────────────
// Cascades drop role members and any channel-access rows referencing this role.

rolesRoutes.delete('/roles/:id', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');

	const [role] = await db.select().from(voiceRoles).where(eq(voiceRoles.id, id)).limit(1);
	if (!role) return c.json({ error: 'not found' }, 404);

	const perms = await groupVoicePerms(role.groupId, me.userId);
	if (!perms.manageRoles) return c.json({ error: 'forbidden' }, 403);

	// Capture the channels this role currently gates BEFORE the cascade so we
	// can emit per-channel access_changed events afterwards. The role being
	// removed means those channels' allowlists shrink by one.
	const affected = await db
		.select({ channelId: voiceChannelRoleAccess.channelId })
		.from(voiceChannelRoleAccess)
		.where(eq(voiceChannelRoleAccess.roleId, id));

	await db.delete(voiceRoles).where(eq(voiceRoles.id, id));

	const targetUserIds = await groupMemberIds(role.groupId);
	publishVoiceRoleDeleted({
		targetUserIds,
		groupId: role.groupId,
		roleId: id,
	}).catch((err) => {
		log.warn({ err }, 'publishVoiceRoleDeleted failed');
	});

	for (const { channelId } of affected) {
		const remaining = await db
			.select({ roleId: voiceChannelRoleAccess.roleId })
			.from(voiceChannelRoleAccess)
			.where(eq(voiceChannelRoleAccess.channelId, channelId));
		publishVoiceChannelAccessChanged({
			targetUserIds,
			groupId: role.groupId,
			channelId,
			roleIds: remaining.map((r) => r.roleId),
		}).catch((err) => {
			log.warn({ err }, 'publishVoiceChannelAccessChanged failed');
		});
	}

	return c.json({ success: true });
});

// ─── Add member to role ─────────────────────────────────────────

rolesRoutes.post('/roles/:id/members', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const body = await c.req.json().catch(() => ({}));
	const userId = String(body?.userId ?? '').trim();
	if (!userId) return c.json({ error: 'userId required' }, 400);

	const [role] = await db.select().from(voiceRoles).where(eq(voiceRoles.id, id)).limit(1);
	if (!role) return c.json({ error: 'not found' }, 404);

	const perms = await groupVoicePerms(role.groupId, me.userId);
	if (!perms.manageRoles) return c.json({ error: 'forbidden' }, 403);

	// Target user must actually be in the group — otherwise the role
	// assignment is meaningless and could surface ghost members in the UI.
	const [target] = await db
		.select({ userId: groupMembersMirror.userId })
		.from(groupMembersMirror)
		.where(and(eq(groupMembersMirror.groupId, role.groupId), eq(groupMembersMirror.userId, userId)))
		.limit(1);
	if (!target) return c.json({ error: 'user not in group' }, 400);

	await db.insert(voiceRoleMembers).values({
		roleId: id,
		userId,
		addedBy: me.userId,
	}).onConflictDoNothing();

	const targetUserIds = await groupMemberIds(role.groupId);
	publishVoiceRoleMembersChanged({
		targetUserIds,
		groupId: role.groupId,
		roleId: id,
		kind: 'added',
		userId,
	}).catch((err) => {
		log.warn({ err }, 'publishVoiceRoleMembersChanged failed');
	});

	return c.json({ success: true });
});

// ─── Remove member from role ────────────────────────────────────

rolesRoutes.delete('/roles/:id/members/:userId', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const userId = c.req.param('userId');

	const [role] = await db.select().from(voiceRoles).where(eq(voiceRoles.id, id)).limit(1);
	if (!role) return c.json({ error: 'not found' }, 404);

	const perms = await groupVoicePerms(role.groupId, me.userId);
	if (!perms.manageRoles) return c.json({ error: 'forbidden' }, 403);

	await db
		.delete(voiceRoleMembers)
		.where(and(eq(voiceRoleMembers.roleId, id), eq(voiceRoleMembers.userId, userId)));

	const targetUserIds = await groupMemberIds(role.groupId);
	publishVoiceRoleMembersChanged({
		targetUserIds,
		groupId: role.groupId,
		roleId: id,
		kind: 'removed',
		userId,
	}).catch((err) => {
		log.warn({ err }, 'publishVoiceRoleMembersChanged failed');
	});

	return c.json({ success: true });
});

// ─── Channel access (allowlist) ─────────────────────────────────
// GET the current allowlist for a channel; PUT replaces it wholesale. Wholesale
// replace keeps the API tiny and avoids partial-state edge cases — the UI
// always sends the complete desired set.

rolesRoutes.get('/channels/:id/access', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');

	const [ch] = await db.select().from(voiceChannels).where(eq(voiceChannels.id, id)).limit(1);
	if (!ch) return c.json({ error: 'not found' }, 404);

	const perms = await groupVoicePerms(ch.groupId, me.userId);
	if (!perms.role) return c.json({ error: 'forbidden' }, 403);

	const rows = await db
		.select({ roleId: voiceChannelRoleAccess.roleId })
		.from(voiceChannelRoleAccess)
		.where(eq(voiceChannelRoleAccess.channelId, id));

	return c.json({ roleIds: rows.map((r) => r.roleId), canManage: perms.manageChannels });
});

rolesRoutes.put('/channels/:id/access', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const body = await c.req.json().catch(() => ({}));
	const raw = Array.isArray(body?.roleIds) ? body.roleIds : null;
	if (!raw) return c.json({ error: 'roleIds array required' }, 400);
	const desired: string[] = Array.from(new Set(raw.map((x: unknown) => String(x))));

	const [ch] = await db.select().from(voiceChannels).where(eq(voiceChannels.id, id)).limit(1);
	if (!ch) return c.json({ error: 'not found' }, 404);

	const perms = await groupVoicePerms(ch.groupId, me.userId);
	if (!perms.manageChannels) return c.json({ error: 'forbidden' }, 403);

	// Every role in the desired set must belong to this group — guard against
	// cross-group leaks where a manager could attach a role they don't own.
	if (desired.length > 0) {
		const valid = await db
			.select({ id: voiceRoles.id })
			.from(voiceRoles)
			.where(and(inArray(voiceRoles.id, desired), eq(voiceRoles.groupId, ch.groupId)));
		if (valid.length !== desired.length) {
			return c.json({ error: 'invalid roleIds' }, 400);
		}
	}

	// Replace wholesale inside a transaction so we never expose a half-applied
	// allowlist to a concurrent join attempt.
	await db.transaction(async (tx) => {
		await tx.delete(voiceChannelRoleAccess).where(eq(voiceChannelRoleAccess.channelId, id));
		if (desired.length > 0) {
			await tx.insert(voiceChannelRoleAccess).values(
				desired.map((roleId: string) => ({
					channelId: id,
					roleId,
					grantedBy: me.userId,
				})),
			);
		}
	});

	const targetUserIds = await groupMemberIds(ch.groupId);
	publishVoiceChannelAccessChanged({
		targetUserIds,
		groupId: ch.groupId,
		channelId: id,
		roleIds: desired,
	}).catch((err) => {
		log.warn({ err }, 'publishVoiceChannelAccessChanged failed');
	});

	return c.json({ success: true, roleIds: desired });
});
