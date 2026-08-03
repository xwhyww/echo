import { untrack } from 'svelte';
import { groupsService } from '$lib/api/groupsService.js';
import { ws } from '$lib/stores/ws.svelte.js';
import { lookupMember, type SelfLike } from '$lib/utils/members.js';
import type { GroupMember } from '$lib/api/groups.js';

/**
 * A group's roster, kept current from the socket, for screens that need to put
 * a name and face to a user id — reaction lists, mention rendering — without
 * each of them fetching the members themselves.
 */
export function useGroupMemberIndex(getGroupId: () => string) {
	let members = $state<GroupMember[]>([]);

	$effect(() => {
		const id = getGroupId();
		if (!id) return;
		untrack(() => {
			members = [];
			void load(id);
		});
	});

	$effect(() => {
		const id = getGroupId();
		return ws.on((e) => {
			switch (e.type) {
				case 'group_member_joined':
					if (e.groupId !== id) return;
					if (members.some((m) => m.userId === e.member.userId)) return;
					members = [
						...members,
						{
							userId: e.member.userId,
							role: e.member.role,
							nickname: e.member.nickname,
							joinedAt: e.member.joinedAt,
							username: e.member.user.username,
							displayName: e.member.user.displayName,
							avatarUrl: e.member.user.avatarUrl,
						},
					];
					return;
				case 'group_member_left':
					if (e.groupId !== id) return;
					members = members.filter((m) => m.userId !== e.userId);
					return;
				case 'group_member_role':
					if (e.groupId !== id) return;
					members = members.map((m) => (m.userId === e.userId ? { ...m, role: e.role } : m));
					return;
				case 'reconnected':
					// Joins and departures we missed while the socket was down can't be
					// reconstructed from deltas, so re-list.
					void load(id);
					return;
			}
		});
	});

	async function load(id: string) {
		try {
			const res = await groupsService.listMembers(id);
			// A response for a group we've since navigated away from is stale.
			if (id !== getGroupId()) return;
			members = res.members;
		} catch (err) {
			console.error('[useGroupMemberIndex] load failed', err);
		}
	}

	return {
		get members() { return members; },
		find(userId: string, me: SelfLike | null = null) {
			return lookupMember(members, userId, me);
		},
	};
}
