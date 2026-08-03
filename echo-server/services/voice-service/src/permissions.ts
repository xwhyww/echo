import { and, eq, inArray } from 'drizzle-orm';
import { VOICE_PERMS } from '@echo/shared';
import { createDb } from './db/index.js';
import {
	voiceChannels,
	voiceChannelRoleAccess,
	voiceRoles,
	voiceRoleMembers,
	groupMembersMirror,
} from './db/schema.js';
import { config } from './config.js';

const db = createDb(config.databaseUrl);

export type GroupRole = 'owner' | 'admin' | 'member';

// ─── Membership ──────────────────────────────────────────────────

export async function membership(groupId: string, userId: string): Promise<GroupRole | null> {
	const [m] = await db
		.select({ role: groupMembersMirror.role })
		.from(groupMembersMirror)
		.where(and(eq(groupMembersMirror.groupId, groupId), eq(groupMembersMirror.userId, userId)))
		.limit(1);
	return (m?.role as GroupRole) ?? null;
}

export async function groupMemberIds(groupId: string): Promise<string[]> {
	const rows = await db
		.select({ userId: groupMembersMirror.userId })
		.from(groupMembersMirror)
		.where(eq(groupMembersMirror.groupId, groupId));
	return rows.map((r) => r.userId);
}

// ─── Per-user role lookups ──────────────────────────────────────

// All voice roles a user holds in a given group. Returns the role rows so the
// caller can OR their permissions or look them up by id without a second query.
export async function userVoiceRoles(groupId: string, userId: string): Promise<{
	id: string;
	permissions: number;
}[]> {
	return db
		.select({ id: voiceRoles.id, permissions: voiceRoles.permissions })
		.from(voiceRoleMembers)
		.innerJoin(voiceRoles, eq(voiceRoleMembers.roleId, voiceRoles.id))
		.where(and(eq(voiceRoles.groupId, groupId), eq(voiceRoleMembers.userId, userId)));
}

// ─── Group-level (manage) permissions ───────────────────────────
// Owner/admin always have both manage caps. Otherwise the user inherits the OR
// of every role they hold in this group.

export interface GroupVoicePerms {
	manageChannels: boolean;
	manageRoles: boolean;
	role: GroupRole | null;
}

export async function groupVoicePerms(groupId: string, userId: string): Promise<GroupVoicePerms> {
	const role = await membership(groupId, userId);
	if (!role) return { manageChannels: false, manageRoles: false, role: null };
	if (role === 'owner' || role === 'admin') {
		return { manageChannels: true, manageRoles: true, role };
	}
	const roles = await userVoiceRoles(groupId, userId);
	const perms = roles.reduce((a, r) => a | r.permissions, 0);
	return {
		manageChannels: (perms & VOICE_PERMS.MANAGE_CHANNELS) !== 0,
		manageRoles: (perms & VOICE_PERMS.MANAGE_ROLES) !== 0,
		role,
	};
}

// ─── Channel access ─────────────────────────────────────────────
// `visible` is the gate for "show in the list / can attempt to join". `canConnect`
// is the actual join gate (without CONNECT, even if visible the join is denied).
// `canSpeak` gates the LiveKit token's microphone source; `canShare` gates the
// screen-share sources.

export interface ChannelAccess {
	visible: boolean;
	canConnect: boolean;
	canSpeak: boolean;
	canShare: boolean;
}

const DENY: ChannelAccess = { visible: false, canConnect: false, canSpeak: false, canShare: false };
const ALLOW_ALL: ChannelAccess = { visible: true, canConnect: true, canSpeak: true, canShare: true };

export async function channelAccess(
	channelId: string,
	groupId: string,
	userId: string,
	groupRole?: GroupRole | null,
): Promise<ChannelAccess> {
	const role = groupRole ?? (await membership(groupId, userId));
	if (!role) return DENY;
	if (role === 'owner' || role === 'admin') return ALLOW_ALL;

	const allowlist = await db
		.select({ roleId: voiceChannelRoleAccess.roleId })
		.from(voiceChannelRoleAccess)
		.where(eq(voiceChannelRoleAccess.channelId, channelId));

	if (allowlist.length === 0) {
		// Open channel — every group member gets baseline {connect, speak}.
		return ALLOW_ALL;
	}

	const allowedRoleIds = allowlist.map((r) => r.roleId);
	const matched = await db
		.select({ permissions: voiceRoles.permissions })
		.from(voiceRoleMembers)
		.innerJoin(voiceRoles, eq(voiceRoleMembers.roleId, voiceRoles.id))
		.where(and(
			eq(voiceRoleMembers.userId, userId),
			inArray(voiceRoles.id, allowedRoleIds),
		));

	if (matched.length === 0) return DENY;

	const perms = matched.reduce((a, r) => a | r.permissions, 0);
	return {
		visible: true,
		canConnect: (perms & VOICE_PERMS.CONNECT) !== 0,
		canSpeak: (perms & VOICE_PERMS.SPEAK) !== 0,
		canShare: (perms & VOICE_PERMS.CAN_SHARE) !== 0,
	};
}

// Bulk variant for listChannels — avoids N+1 by fetching the entire allowlist
// for the group and the user's role memberships in a single pass each.
export async function channelAccessMap(
	groupId: string,
	userId: string,
	channelIds: string[],
	groupRole?: GroupRole | null,
): Promise<Map<string, ChannelAccess>> {
	const result = new Map<string, ChannelAccess>();
	if (channelIds.length === 0) return result;

	const role = groupRole ?? (await membership(groupId, userId));
	if (!role) {
		for (const id of channelIds) result.set(id, DENY);
		return result;
	}
	if (role === 'owner' || role === 'admin') {
		for (const id of channelIds) result.set(id, ALLOW_ALL);
		return result;
	}

	// Single query for every restriction row on every channel in this group.
	// Channels missing from this map are open (no rows -> allow-all).
	const accessRows = await db
		.select({
			channelId: voiceChannelRoleAccess.channelId,
			roleId: voiceChannelRoleAccess.roleId,
			permissions: voiceRoles.permissions,
		})
		.from(voiceChannelRoleAccess)
		.innerJoin(voiceRoles, eq(voiceChannelRoleAccess.roleId, voiceRoles.id))
		.innerJoin(voiceChannels, eq(voiceChannels.id, voiceChannelRoleAccess.channelId))
		.where(eq(voiceChannels.groupId, groupId));

	// channelId -> roleId -> permissions
	const byChannel = new Map<string, Map<string, number>>();
	for (const row of accessRows) {
		let inner = byChannel.get(row.channelId);
		if (!inner) {
			inner = new Map<string, number>();
			byChannel.set(row.channelId, inner);
		}
		inner.set(row.roleId, row.permissions);
	}

	// User's role membership in this group.
	const userRoles = new Set(
		(await userVoiceRoles(groupId, userId)).map((r) => r.id),
	);

	for (const channelId of channelIds) {
		const inner = byChannel.get(channelId);
		if (!inner || inner.size === 0) {
			result.set(channelId, ALLOW_ALL);
			continue;
		}
		let perms = 0;
		let anyMatch = false;
		for (const [roleId, p] of inner) {
			if (userRoles.has(roleId)) {
				anyMatch = true;
				perms |= p;
			}
		}
		if (!anyMatch) {
			result.set(channelId, DENY);
		} else {
			result.set(channelId, {
				visible: true,
				canConnect: (perms & VOICE_PERMS.CONNECT) !== 0,
				canSpeak: (perms & VOICE_PERMS.SPEAK) !== 0,
				canShare: (perms & VOICE_PERMS.CAN_SHARE) !== 0,
			});
		}
	}

	return result;
}
