import { groupsService } from '$lib/api/groupsService.js';
import { toasts } from '$lib/stores/toasts.svelte.js';
import { voiceService } from '$lib/api/voiceService.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';
import { toRoleMember } from '$lib/utils/voiceRoles.js';
import type { GroupMember } from '$lib/api/groups.js';
import type { VoiceRole, VoiceRoleMember } from '$lib/api/voice.js';

/**
 * Who is in a role: the group roster the picker offers, and adding or removing
 * people.
 *
 * The role list itself belongs to `useVoiceRoles`; this reaches it through the
 * one `patchRole` primitive it is handed, which is the whole seam between them.
 */
export function useVoiceRoleMembers(options: {
	groupId: () => string;
	patchRole: (roleId: string, update: (role: VoiceRole) => VoiceRole) => void;
}) {
	const t = $derived(i18n.t);

	// The picker's own query and in-flight rows live in the modal; the roster
	// stays here because it is worth caching across opens.
	let members = $state<GroupMember[]>([]);
	let loading = $state(false);
	let openFor = $state<string | null>(null);

	return {
		get openFor() { return openFor; },
		get members() { return members; },
		get loading() { return loading; },

		/** For the WS reducer: the profile behind a user id, if we have it cached. */
		lookup(userId: string): VoiceRoleMember | null {
			const cached = members.find((m) => m.userId === userId);
			return cached ? toRoleMember(cached) : null;
		},

		async openPicker(roleId: string) {
			openFor = roleId;
			// Always re-fetch: people join and leave the group while the panel is
			// open. The spinner only shows when there's nothing cached to display,
			// so a re-open doesn't blank a list we could already render.
			loading = members.length === 0;
			try {
				const res = await groupsService.listMembers(options.groupId());
				members = res.members;
			} catch (err) {
				console.error('[useVoiceRoleMembers] listMembers failed', err);
				toasts.error(t.voice.roles.loadMembersFailed);
			} finally {
				loading = false;
			}
		},

		closePicker() { openFor = null; },

		/** Called when a role disappears under an open picker. */
		dismissIfOpenFor(roleId: string) {
			if (openFor === roleId) openFor = null;
		},

		// Optimistic — the WS event will arrive, but the chip shouldn't wait for
		// the round-trip.
		add(roleId: string, m: GroupMember) {
			options.patchRole(roleId, (r) =>
				r.members.some((x) => x.userId === m.userId)
					? r
					: { ...r, members: [...r.members, toRoleMember(m)] },
			);
		},

		async remove(roleId: string, userId: string) {
			try {
				await voiceService.removeRoleMember(roleId, userId);
				options.patchRole(roleId, (r) => ({
					...r,
					members: r.members.filter((x) => x.userId !== userId),
				}));
			} catch (err) {
				console.error('[useVoiceRoleMembers] removeMember failed', err);
				toasts.error((err as Error).message ?? t.voice.roles.removeMemberFailed);
			}
		},
	};
}
