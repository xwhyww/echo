import { Plug, Mic, ScreenShare, Settings, ShieldCheck } from 'lucide-svelte';
import { VOICE_PERMS, type VoiceRole, type VoiceRoleMember } from '$lib/api/voice.js';
import type { GroupMember } from '$lib/api/groups.js';
import type { Dict } from '$lib/i18n/en.js';
import type { WsEvent } from '$lib/stores/ws.svelte.js';

export interface PermissionMeta {
	bit: number;
	label: string;
	icon: typeof Plug;
}

export interface RoleColorOption {
	value: string;
	label: string;
}

export interface RolePosition {
	id: string;
	position: number;
}

/**
 * Permission bit → label + icon. Single source of truth for both the read-only
 * pills and the edit checkboxes, so the order/labels stay in sync.
 */
export function permissionMeta(t: Dict): PermissionMeta[] {
	return [
		{ bit: VOICE_PERMS.CONNECT, label: t.voice.roles.permissions.connect, icon: Plug },
		{ bit: VOICE_PERMS.SPEAK, label: t.voice.roles.permissions.speak, icon: Mic },
		{ bit: VOICE_PERMS.CAN_SHARE, label: t.voice.roles.permissions.share, icon: ScreenShare },
		{ bit: VOICE_PERMS.MANAGE_CHANNELS, label: t.voice.roles.permissions.manageChannels, icon: Settings },
		{ bit: VOICE_PERMS.MANAGE_ROLES, label: t.voice.roles.permissions.manageRoles, icon: ShieldCheck },
	];
}

/**
 * What a freshly created role gets. The most common case is "a role that can
 * talk and present in some specific channel" — managers can untick later.
 */
export const DEFAULT_PERMISSIONS = VOICE_PERMS.CONNECT | VOICE_PERMS.SPEAK | VOICE_PERMS.CAN_SHARE;

/**
 * Preset role colours (first = accent). Stored on the role's `color` field and
 * used to tint the shield on each row.
 */
export const ROLE_COLORS = ['#25939d', '#e0a832', '#3fba6f', '#4a9ee0', '#9b7ede', '#e0568f', '#5bc0be', '#b5b2aa'];

/**
 * Colours paired with a name, so each swatch gets a distinguishable label
 * instead of eight buttons all announcing "Set role color".
 */
export function roleColorOptions(t: Dict): RoleColorOption[] {
	return ROLE_COLORS.map((value, i) => ({ value, label: t.voice.roles.colorNames[i] ?? value }));
}

/** A role's tint, falling back to the accent for roles that never picked one. */
export function roleColor(c: string | null | undefined): string {
	return c && c.trim() ? c : 'var(--c-accent)';
}

export function hasPermission(permissions: number, bit: number): boolean {
	return (permissions & bit) !== 0;
}

export function togglePermission(permissions: number, bit: number): number {
	return hasPermission(permissions, bit) ? permissions & ~bit : permissions | bit;
}

export function memberLabel(m: VoiceRoleMember): string {
	return m.displayName?.trim() || m.username;
}

/** Narrow a group member down to what a role membership chip needs. */
export function toRoleMember(m: GroupMember): VoiceRoleMember {
	return {
		userId: m.userId,
		username: m.username,
		displayName: m.displayName,
		avatarUrl: m.avatarUrl,
	};
}

/**
 * Top of the list = lowest position = highest priority (matches the server's
 * asc-by-position list and the members-list grouping in VoiceChannelChat).
 */
export function sortRoles(roles: VoiceRole[]): VoiceRole[] {
	return [...roles].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
}

/** Which half of the hovered row the pointer is in — i.e. drop above or below it. */
export function isPastMidpoint(clientY: number, rect: DOMRect): boolean {
	return clientY > rect.top + rect.height / 2;
}

/**
 * Move `dragId` to the drop slot at `overId` and renumber the list 0..n-1.
 * Returns `null` when the drag resolves to a no-op, so the caller can bail
 * without touching state or the network.
 */
export function reorderRoles(
	roles: VoiceRole[],
	dragId: string,
	overId: string,
	after: boolean,
): { roles: VoiceRole[]; changes: RolePosition[] } | null {
	if (dragId === overId) return null;

	const current = sortRoles(roles);
	const fromIdx = current.findIndex((r) => r.id === dragId);
	let toIdx = current.findIndex((r) => r.id === overId);
	if (fromIdx === -1 || toIdx === -1) return null;
	if (after) toIdx += 1;
	// Account for the dragged item being removed before reinsert.
	if (fromIdx < toIdx) toIdx -= 1;
	if (toIdx === fromIdx) return null;

	const reordered = [...current];
	const [moved] = reordered.splice(fromIdx, 1);
	reordered.splice(toIdx, 0, moved);

	// Renumber by new index. Only roles whose position actually changed need a
	// PATCH — a drag near the end of a long list moves two or three rows, not all
	// of them.
	const changes: RolePosition[] = [];
	const next = reordered.map((r, i) => {
		if (r.position !== i) changes.push({ id: r.id, position: i });
		return { ...r, position: i };
	});
	return { roles: next, changes };
}

/** Group members not already in the role, narrowed by the picker's query. */
export function filterMembers(
	members: GroupMember[],
	exclude: Set<string>,
	query: string,
): GroupMember[] {
	const q = query.trim().toLowerCase();
	return members
		.filter((m) => !exclude.has(m.userId))
		.filter((m) => {
			if (!q) return true;
			return (
				m.username.toLowerCase().includes(q)
				|| (m.displayName ?? '').toLowerCase().includes(q)
			);
		});
}

/**
 * Applies one WS event to the role list, or returns `null` when the event isn't
 * about this group's roles. The same shape as `reduceVoiceListEvent` for
 * channels, and pure for the same reason: this is the part worth testing.
 *
 * `lookupMember` resolves a newly added user against whatever roster the caller
 * has cached; when it comes back empty the chip still renders, from a stub.
 */
export function applyRoleEvent(
	roles: VoiceRole[],
	event: WsEvent,
	groupId: string,
	lookupMember: (userId: string) => VoiceRoleMember | null,
): VoiceRole[] | null {
	switch (event.type) {
		case 'voice_role_created': {
			if (event.role.groupId !== groupId) return null;
			if (roles.some((r) => r.id === event.role.id)) return null;
			return [...roles, { ...event.role, members: [] }];
		}
		case 'voice_role_updated': {
			if (event.groupId !== groupId) return null;
			return roles.map((r) => (r.id === event.roleId ? { ...r, ...event.patch } : r));
		}
		case 'voice_role_deleted': {
			if (event.groupId !== groupId) return null;
			return roles.filter((r) => r.id !== event.roleId);
		}
		case 'voice_role_members_changed': {
			if (event.groupId !== groupId) return null;
			return roles.map((r) => {
				if (r.id !== event.roleId) return r;
				if (event.kind === 'removed') {
					return { ...r, members: r.members.filter((m) => m.userId !== event.userId) };
				}
				if (r.members.some((m) => m.userId === event.userId)) return r;
				const member = lookupMember(event.userId) ?? {
					userId: event.userId,
					username: event.userId,
					displayName: null,
					avatarUrl: null,
				};
				return { ...r, members: [...r.members, member] };
			});
		}
		default:
			return null;
	}
}

export interface RoleDraft {
	name: string;
	permissions: number;
	color: string | null;
}

export type RolePatch = Partial<Pick<VoiceRole, 'name' | 'permissions' | 'color'>>;

/**
 * What actually changed between a role and its edit draft.
 *
 * `null` means "not a save": the name was blanked, which is an unfinished edit
 * rather than a rename. An empty object means nothing changed — the caller
 * should close the editor without asking the server anything.
 */
export function roleEditPatch(role: VoiceRole, draft: RoleDraft): RolePatch | null {
	const name = draft.name.trim();
	if (!name) return null;
	const patch: RolePatch = {};
	if (name !== role.name) patch.name = name;
	if (draft.permissions !== role.permissions) patch.permissions = draft.permissions;
	if (draft.color !== role.color) patch.color = draft.color;
	return patch;
}
