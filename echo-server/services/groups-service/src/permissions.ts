export type Role = 'owner' | 'admin' | 'member';

export type InvitePolicy = 'owner' | 'admins' | 'everyone';
export type MessagePolicy = 'owner' | 'admins' | 'everyone';
export type PinPolicy = 'owner' | 'admins' | 'everyone';
export type EditInfoPolicy = 'owner' | 'admins';

export type Action =
	| 'message.send'
	| 'message.edit_own'
	| 'message.delete_own'
	| 'message.delete_any'
	| 'message.pin'
	| 'invite.revoke'
	| 'member.kick'
	| 'member.change_role'
	| 'group.edit'
	| 'group.delete'
	| 'group.transfer';

const ROLE_RANK: Record<Role, number> = { member: 0, admin: 1, owner: 2 };

export function isAtLeast(actor: Role, min: Role): boolean {
	return ROLE_RANK[actor] >= ROLE_RANK[min];
}

export function can(role: Role, action: Action): boolean {
	switch (action) {
		case 'message.send':
		case 'message.edit_own':
		case 'message.delete_own':
			return isAtLeast(role, 'member');
		case 'message.delete_any':
		case 'message.pin':
		case 'invite.revoke':
		case 'member.kick':
		case 'group.edit':
			return isAtLeast(role, 'admin');
		case 'member.change_role':
		case 'group.delete':
		case 'group.transfer':
			return role === 'owner';
	}
}

export function canInvite(role: Role, policy: InvitePolicy): boolean {
	switch (policy) {
		case 'owner': return role === 'owner';
		case 'admins': return isAtLeast(role, 'admin');
		case 'everyone': return isAtLeast(role, 'member');
	}
}

export function canMessage(role: Role, policy: MessagePolicy): boolean {
	switch (policy) {
		case 'owner': return role === 'owner';
		case 'admins': return isAtLeast(role, 'admin');
		case 'everyone': return isAtLeast(role, 'member');
	}
}

export function canPin(role: Role, policy: PinPolicy): boolean {
	switch (policy) {
		case 'owner': return role === 'owner';
		case 'admins': return isAtLeast(role, 'admin');
		case 'everyone': return isAtLeast(role, 'member');
	}
}

export function canEditInfo(role: Role, policy: EditInfoPolicy): boolean {
	switch (policy) {
		case 'owner': return role === 'owner';
		case 'admins': return isAtLeast(role, 'admin');
	}
}

export function isValidInvitePolicy(v: unknown): v is InvitePolicy {
	return v === 'owner' || v === 'admins' || v === 'everyone';
}

export function isValidMessagePolicy(v: unknown): v is MessagePolicy {
	return v === 'owner' || v === 'admins' || v === 'everyone';
}

export function isValidPinPolicy(v: unknown): v is PinPolicy {
	return v === 'owner' || v === 'admins' || v === 'everyone';
}

export function isValidEditInfoPolicy(v: unknown): v is EditInfoPolicy {
	return v === 'owner' || v === 'admins';
}
