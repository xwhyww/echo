import type { GroupMember } from '$lib/api/groups.js';

/** Just enough of the signed-in user to render them like any other member. */
export interface SelfLike {
	id: string;
	username: string;
	displayName?: string | null;
	avatarUrl?: string | null;
}

export interface MemberDisplay {
	name: string;
	avatarUrl: string | null;
}

/**
 * What to call someone inside a group.
 *
 * `GroupMember.nickname` — a per-group override, settable through
 * `groupsService.updateMember` — is deliberately *not* consulted: nothing on
 * screen honours it today (`GroupMemberRow` included), and having reaction
 * tooltips be the one place that did would be worse than having none. Change it
 * here and in `GroupMemberRow` together, or not at all.
 */
export function memberDisplayName(m: GroupMember): string {
	return m.displayName ?? m.username;
}

/**
 * Resolves a user id to a name and face for the reaction and seen-by lists.
 *
 * Falls back to the signed-in user because our own reactions have to render
 * before — or without — the roster arriving; and to `null` for anyone who has
 * since left, which callers treat as "don't show a row".
 */
export function lookupMember(
	members: GroupMember[],
	userId: string,
	me: SelfLike | null,
): MemberDisplay | null {
	const m = members.find((x) => x.userId === userId);
	if (m) return { name: memberDisplayName(m), avatarUrl: m.avatarUrl ?? null };
	if (me && me.id === userId) {
		return { name: me.displayName ?? me.username, avatarUrl: me.avatarUrl ?? null };
	}
	return null;
}
