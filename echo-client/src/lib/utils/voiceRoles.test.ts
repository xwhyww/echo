import { describe, it, expect } from 'vitest';
import { VOICE_PERMS, type VoiceRole } from '$lib/api/voice.js';
import type { WsEvent } from '$lib/stores/ws.svelte.js';
import {
	hasPermission,
	togglePermission,
	DEFAULT_PERMISSIONS,
	roleColor,
	sortRoles,
	reorderRoles,
	isPastMidpoint,
	filterMembers,
	roleEditPatch,
	applyRoleEvent,
} from './voiceRoles.js';

// The pure half of the voice-roles screen. Bit maths and index maths: both are
// easy to get subtly wrong and impossible to notice by looking at the UI, since
// a wrong bit just means someone silently can or cannot do something.

function role(over: Partial<VoiceRole> = {}): VoiceRole {
	return {
		id: 'r1',
		groupId: 'g1',
		name: 'Role',
		color: null,
		permissions: DEFAULT_PERMISSIONS,
		position: 0,
		createdBy: 'u1',
		createdAt: '2026-01-01T00:00:00.000Z',
		members: [],
		...over,
	} as VoiceRole;
}

describe('permission bits', () => {
	it('reads each bit independently', () => {
		const perms = VOICE_PERMS.CONNECT | VOICE_PERMS.MANAGE_ROLES;
		expect(hasPermission(perms, VOICE_PERMS.CONNECT)).toBe(true);
		expect(hasPermission(perms, VOICE_PERMS.MANAGE_ROLES)).toBe(true);
		expect(hasPermission(perms, VOICE_PERMS.SPEAK)).toBe(false);
		expect(hasPermission(perms, VOICE_PERMS.CAN_SHARE)).toBe(false);
	});

	it('reads nothing out of an empty mask', () => {
		for (const bit of Object.values(VOICE_PERMS)) {
			expect(hasPermission(0, bit)).toBe(false);
		}
	});

	it('toggles one bit without disturbing the others', () => {
		const before = VOICE_PERMS.CONNECT | VOICE_PERMS.SPEAK;
		const after = togglePermission(before, VOICE_PERMS.SPEAK);
		expect(hasPermission(after, VOICE_PERMS.SPEAK)).toBe(false);
		expect(hasPermission(after, VOICE_PERMS.CONNECT)).toBe(true);
	});

	it('round-trips a toggle', () => {
		for (const bit of Object.values(VOICE_PERMS)) {
			expect(togglePermission(togglePermission(DEFAULT_PERMISSIONS, bit), bit))
				.toBe(DEFAULT_PERMISSIONS);
		}
	});

	it('gives a new role connect, speak and share but no management', () => {
		expect(hasPermission(DEFAULT_PERMISSIONS, VOICE_PERMS.CONNECT)).toBe(true);
		expect(hasPermission(DEFAULT_PERMISSIONS, VOICE_PERMS.SPEAK)).toBe(true);
		expect(hasPermission(DEFAULT_PERMISSIONS, VOICE_PERMS.CAN_SHARE)).toBe(true);
		// A freshly created role handing out MANAGE_ROLES would let its members
		// grant themselves anything.
		expect(hasPermission(DEFAULT_PERMISSIONS, VOICE_PERMS.MANAGE_ROLES)).toBe(false);
		expect(hasPermission(DEFAULT_PERMISSIONS, VOICE_PERMS.MANAGE_CHANNELS)).toBe(false);
	});

	it('keeps every bit distinct', () => {
		// A duplicated value would make two permissions the same permission.
		const values = Object.values(VOICE_PERMS);
		expect(new Set(values).size).toBe(values.length);
	});
});

describe('roleColor', () => {
	it('falls back to the accent for a role that never picked one', () => {
		expect(roleColor(null)).toBe('var(--c-accent)');
		expect(roleColor(undefined)).toBe('var(--c-accent)');
		expect(roleColor('   ')).toBe('var(--c-accent)');
	});

	it('keeps a chosen colour', () => {
		expect(roleColor('#25939d')).toBe('#25939d');
	});
});

describe('sortRoles', () => {
	it('orders by position, lowest first', () => {
		const roles = [role({ id: 'b', position: 2 }), role({ id: 'a', position: 1 })];
		expect(sortRoles(roles).map((r) => r.id)).toEqual(['a', 'b']);
	});

	it('breaks a tie by creation time, so the order is stable', () => {
		const roles = [
			role({ id: 'newer', position: 0, createdAt: '2026-02-01T00:00:00.000Z' }),
			role({ id: 'older', position: 0, createdAt: '2026-01-01T00:00:00.000Z' }),
		];
		expect(sortRoles(roles).map((r) => r.id)).toEqual(['older', 'newer']);
	});

	it('does not mutate its input', () => {
		const roles = [role({ id: 'b', position: 2 }), role({ id: 'a', position: 1 })];
		sortRoles(roles);
		expect(roles.map((r) => r.id)).toEqual(['b', 'a']);
	});
});

describe('reorderRoles', () => {
	const list = [
		role({ id: 'a', position: 0 }),
		role({ id: 'b', position: 1 }),
		role({ id: 'c', position: 2 }),
	];

	it('moves a role up and renumbers', () => {
		const out = reorderRoles(list, 'c', 'a', false);
		expect(out?.roles.map((r) => r.id)).toEqual(['c', 'a', 'b']);
		expect(out?.roles.map((r) => r.position)).toEqual([0, 1, 2]);
	});

	it('moves a role down, accounting for its own removal', () => {
		// The off-by-one that makes this worth a test: dropping `a` after `c` in a
		// three-item list has to land at index 2, not 3.
		const out = reorderRoles(list, 'a', 'c', true);
		expect(out?.roles.map((r) => r.id)).toEqual(['b', 'c', 'a']);
	});

	it('reports only the rows whose position actually changed', () => {
		// A drag near the end of a long list must not PATCH every role.
		const out = reorderRoles(list, 'b', 'c', true);
		expect(out?.roles.map((r) => r.id)).toEqual(['a', 'c', 'b']);
		expect(out?.changes.map((c) => c.id).sort()).toEqual(['b', 'c']);
	});

	it('is null when the drag changes nothing', () => {
		// The caller bails on null without touching state or the network.
		expect(reorderRoles(list, 'a', 'a', false)).toBeNull();
		// Dropping just below yourself is the same slot you were already in.
		expect(reorderRoles(list, 'a', 'a', true)).toBeNull();
		expect(reorderRoles(list, 'b', 'a', true)).toBeNull();
	});

	it('is null when either id is unknown', () => {
		expect(reorderRoles(list, 'missing', 'a', false)).toBeNull();
		expect(reorderRoles(list, 'a', 'missing', false)).toBeNull();
	});
});

describe('isPastMidpoint', () => {
	const rect = { top: 100, height: 40 } as DOMRect;

	it('splits the row at its middle', () => {
		expect(isPastMidpoint(119, rect)).toBe(false);
		expect(isPastMidpoint(121, rect)).toBe(true);
	});

	it('treats the exact midpoint as the upper half', () => {
		expect(isPastMidpoint(120, rect)).toBe(false);
	});
});

describe('filterMembers', () => {
	const members = [
		{ userId: '1', username: 'anna', displayName: 'Анна', avatarUrl: null },
		{ userId: '2', username: 'boris', displayName: null, avatarUrl: null },
	] as never[];

	it('drops members already in the role', () => {
		expect(filterMembers(members, new Set(['1']), '').map((m) => m.userId)).toEqual(['2']);
	});

	it('matches on username and display name, case-insensitively', () => {
		expect(filterMembers(members, new Set(), 'ANN').map((m) => m.userId)).toEqual(['1']);
		expect(filterMembers(members, new Set(), 'Анн').map((m) => m.userId)).toEqual(['1']);
		expect(filterMembers(members, new Set(), 'BOR').map((m) => m.userId)).toEqual(['2']);
	});

	it('treats a blank query as no filter', () => {
		expect(filterMembers(members, new Set(), '   ')).toHaveLength(2);
	});

	it('survives a member with no display name', () => {
		expect(filterMembers(members, new Set(), 'zzz')).toEqual([]);
	});
});

describe('roleEditPatch', () => {
	const existing = role({ name: 'Moderators', permissions: 3, color: '#25939d' });

	it('is null when the name was blanked — an unfinished edit, not a rename', () => {
		expect(roleEditPatch(existing, { name: '  ', permissions: 3, color: '#25939d' })).toBeNull();
	});

	it('is empty when nothing changed, so the editor closes without a request', () => {
		expect(roleEditPatch(existing, { name: 'Moderators', permissions: 3, color: '#25939d' }))
			.toEqual({});
	});

	it('carries only what changed', () => {
		expect(roleEditPatch(existing, { name: 'Mods', permissions: 3, color: '#25939d' }))
			.toEqual({ name: 'Mods' });
		expect(roleEditPatch(existing, { name: 'Moderators', permissions: 7, color: '#25939d' }))
			.toEqual({ permissions: 7 });
	});

	it('trims the name before comparing, so whitespace alone is not a rename', () => {
		expect(roleEditPatch(existing, { name: '  Moderators  ', permissions: 3, color: '#25939d' }))
			.toEqual({});
	});

	it('can clear the colour', () => {
		expect(roleEditPatch(existing, { name: 'Moderators', permissions: 3, color: null }))
			.toEqual({ color: null });
	});
});

describe('applyRoleEvent', () => {
	const lookup = () => null;
	const roles = [role({ id: 'r1' })];

	it('ignores events for another group', () => {
		// Null means "not about us", and the caller leaves its state alone.
		const event = {
			type: 'voice_role_created',
			role: { ...role({ id: 'r2' }), groupId: 'other' },
		} as unknown as WsEvent;
		expect(applyRoleEvent(roles, event, 'g1', lookup)).toBeNull();
	});

	it('ignores an unrelated event type', () => {
		expect(applyRoleEvent(roles, { type: 'typing' } as unknown as WsEvent, 'g1', lookup))
			.toBeNull();
	});

	it('adds a created role', () => {
		const event = {
			type: 'voice_role_created',
			role: { ...role({ id: 'r2' }), members: undefined },
		} as unknown as WsEvent;
		expect(applyRoleEvent(roles, event, 'g1', lookup)?.map((r) => r.id)).toEqual(['r1', 'r2']);
	});

	it('ignores a created role it already has', () => {
		// The author's own client gets the echo of what it just created.
		const event = { type: 'voice_role_created', role: role({ id: 'r1' }) } as unknown as WsEvent;
		expect(applyRoleEvent(roles, event, 'g1', lookup)).toBeNull();
	});

	it('merges a patch into the named role only', () => {
		const two = [role({ id: 'r1', name: 'A' }), role({ id: 'r2', name: 'B' })];
		const event = {
			type: 'voice_role_updated',
			groupId: 'g1',
			roleId: 'r2',
			patch: { name: 'B2' },
		} as unknown as WsEvent;
		const out = applyRoleEvent(two, event, 'g1', lookup);
		expect(out?.map((r) => r.name)).toEqual(['A', 'B2']);
	});

	it('removes a deleted role', () => {
		const event = { type: 'voice_role_deleted', groupId: 'g1', roleId: 'r1' } as unknown as WsEvent;
		expect(applyRoleEvent(roles, event, 'g1', lookup)).toEqual([]);
	});

	it('adds a member, resolving them through the caller\'s roster', () => {
		const event = {
			type: 'voice_role_members_changed',
			groupId: 'g1',
			roleId: 'r1',
			userId: 'u9',
			kind: 'added',
		} as unknown as WsEvent;
		const out = applyRoleEvent(roles, event, 'g1', (id) => ({
			userId: id,
			username: 'nine',
			displayName: null,
			avatarUrl: null,
		}));
		expect(out?.[0].members.map((m) => m.username)).toEqual(['nine']);
	});

	it('still shows a member the roster does not know, from a stub', () => {
		const event = {
			type: 'voice_role_members_changed',
			groupId: 'g1',
			roleId: 'r1',
			userId: 'u9',
			kind: 'added',
		} as unknown as WsEvent;
		const out = applyRoleEvent(roles, event, 'g1', lookup);
		expect(out?.[0].members).toEqual([
			{ userId: 'u9', username: 'u9', displayName: null, avatarUrl: null },
		]);
	});

	it('does not add the same member twice', () => {
		const withMember = [role({
			id: 'r1',
			members: [{ userId: 'u9', username: 'nine', displayName: null, avatarUrl: null }],
		})];
		const event = {
			type: 'voice_role_members_changed',
			groupId: 'g1',
			roleId: 'r1',
			userId: 'u9',
			kind: 'added',
		} as unknown as WsEvent;
		expect(applyRoleEvent(withMember, event, 'g1', lookup)?.[0].members).toHaveLength(1);
	});

	it('removes a member', () => {
		const withMember = [role({
			id: 'r1',
			members: [{ userId: 'u9', username: 'nine', displayName: null, avatarUrl: null }],
		})];
		const event = {
			type: 'voice_role_members_changed',
			groupId: 'g1',
			roleId: 'r1',
			userId: 'u9',
			kind: 'removed',
		} as unknown as WsEvent;
		expect(applyRoleEvent(withMember, event, 'g1', lookup)?.[0].members).toEqual([]);
	});
});
