import { describe, it, expect } from 'vitest';
import {
	isAtLeast,
	can,
	canInvite,
	canMessage,
	canPin,
	canEditInfo,
	isValidInvitePolicy,
	isValidMessagePolicy,
	isValidPinPolicy,
	isValidEditInfoPolicy,
	type Role,
	type Action,
} from './permissions.js';

// Pure functions guarding every write in the service. A mistake here does not
// crash anything — it quietly lets the wrong person do something, which is the
// kind of bug that is only found by someone abusing it.

const ROLES: Role[] = ['member', 'admin', 'owner'];

describe('isAtLeast', () => {
	it('orders member < admin < owner', () => {
		expect(isAtLeast('owner', 'admin')).toBe(true);
		expect(isAtLeast('admin', 'member')).toBe(true);
		expect(isAtLeast('member', 'admin')).toBe(false);
		expect(isAtLeast('admin', 'owner')).toBe(false);
	});

	it('counts a role as at least itself', () => {
		for (const role of ROLES) expect(isAtLeast(role, role)).toBe(true);
	});
});

describe('can', () => {
	// The full table, written out rather than derived, so a change to the code
	// has to be a deliberate change here too.
	const TABLE: Record<Action, Record<Role, boolean>> = {
		'message.send':        { member: true,  admin: true,  owner: true },
		'message.edit_own':    { member: true,  admin: true,  owner: true },
		'message.delete_own':  { member: true,  admin: true,  owner: true },
		'message.delete_any':  { member: false, admin: true,  owner: true },
		'message.pin':         { member: false, admin: true,  owner: true },
		'invite.revoke':       { member: false, admin: true,  owner: true },
		'member.kick':         { member: false, admin: true,  owner: true },
		'group.edit':          { member: false, admin: true,  owner: true },
		'member.change_role':  { member: false, admin: false, owner: true },
		'group.delete':        { member: false, admin: false, owner: true },
		'group.transfer':      { member: false, admin: false, owner: true },
	};

	for (const [action, byRole] of Object.entries(TABLE) as [Action, Record<Role, boolean>][]) {
		for (const role of ROLES) {
			it(`${role} ${byRole[role] ? 'can' : 'cannot'} ${action}`, () => {
				expect(can(role, action)).toBe(byRole[role]);
			});
		}
	}

	it('never lets an admin promote or demote anyone', () => {
		// The one privilege that must not leak downward: an admin who could change
		// roles could make themselves owner.
		expect(can('admin', 'member.change_role')).toBe(false);
	});
});

describe('policy gates', () => {
	// canInvite / canMessage / canPin share a shape; canEditInfo has no
	// "everyone" because group identity is not a member-level thing.
	const cases: [string, (role: Role, policy: never) => boolean][] = [
		['canInvite', canInvite as never],
		['canMessage', canMessage as never],
		['canPin', canPin as never],
	];

	for (const [name, fn] of cases) {
		describe(name, () => {
			it('owner-only lets nobody else through', () => {
				expect(fn('owner', 'owner' as never)).toBe(true);
				expect(fn('admin', 'owner' as never)).toBe(false);
				expect(fn('member', 'owner' as never)).toBe(false);
			});

			it('admins includes the owner', () => {
				// Ranking, not equality — an owner is an admin and then some.
				expect(fn('owner', 'admins' as never)).toBe(true);
				expect(fn('admin', 'admins' as never)).toBe(true);
				expect(fn('member', 'admins' as never)).toBe(false);
			});

			it('everyone means every member', () => {
				for (const role of ROLES) expect(fn(role, 'everyone' as never)).toBe(true);
			});
		});
	}

	describe('canEditInfo', () => {
		it('has no everyone tier', () => {
			expect(canEditInfo('owner', 'owner')).toBe(true);
			expect(canEditInfo('admin', 'owner')).toBe(false);
			expect(canEditInfo('admin', 'admins')).toBe(true);
			expect(canEditInfo('member', 'admins')).toBe(false);
		});
	});
});

describe('policy validators', () => {
	// These stand between a PATCH body and a database column, so anything that
	// is not one of the known strings has to be rejected — not coerced.
	const validators = [
		['invite', isValidInvitePolicy, ['owner', 'admins', 'everyone']],
		['message', isValidMessagePolicy, ['owner', 'admins', 'everyone']],
		['pin', isValidPinPolicy, ['owner', 'admins', 'everyone']],
		['editInfo', isValidEditInfoPolicy, ['owner', 'admins']],
	] as const;

	for (const [name, isValid, accepted] of validators) {
		it(`${name} accepts only ${accepted.join(', ')}`, () => {
			for (const value of accepted) expect(isValid(value)).toBe(true);
			for (const bad of ['everybody', 'ADMINS', '', ' owner', null, undefined, 0, 1, {}, []]) {
				expect(isValid(bad)).toBe(false);
			}
		});
	}

	it('rejects "everyone" for editInfo specifically', () => {
		// It is a valid value for the other three, so a copy-paste would slip past
		// a validator that just checked "is a policy string".
		expect(isValidEditInfoPolicy('everyone')).toBe(false);
	});
});
