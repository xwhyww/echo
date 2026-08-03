import { goto } from '$app/navigation';
import { auth } from '$lib/stores/auth.svelte.js';
import { userService } from '$lib/api/userService.js';
import { routes } from '$lib/routes.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';

/**
 * Opening a profile from inside a conversation — by tapping an avatar, or by
 * clicking an @mention, which has to be resolved to an id first. Either can
 * fail in a way worth telling the user about, so the message is exposed rather
 * than thrown.
 */
export function useMentionNavigation() {
	const t = $derived(i18n.t);

	let error = $state<string | null>(null);

	async function openUser(userId: string) {
		try {
			const { user } = await userService.getById(userId);
			// A restricted profile still resolves; it just isn't ours to open.
			if ((user as { profileRestricted?: boolean }).profileRestricted) {
				error = t.chat.privateProfile;
				return;
			}
			goto(routes.user(userId));
		} catch {
			error = t.chat.userNotFound;
		}
	}

	return {
		get error() { return error; },
		dismiss() { error = null; },
		openUser,
		async openMention(username: string) {
			if (auth.user && username === auth.user.username) {
				await openUser(auth.user.id);
				return;
			}
			try {
				const { users } = await userService.search(username);
				const found = users.find((u) => u.username === username);
				if (!found) {
					error = t.chat.userNotFoundNamed(username);
					return;
				}
				await openUser(found.id);
			} catch {
				error = t.chat.userNotFoundNamed(username);
			}
		},
	};
}
