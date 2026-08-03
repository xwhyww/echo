import { onDestroy } from 'svelte';
import { untrack } from 'svelte';
import { page } from '$app/state';
import { goto } from '$app/navigation';
import { userService } from '$lib/api/userService.js';
import { auth } from '$lib/stores/auth.svelte.js';
import { ws } from '$lib/stores/ws.svelte.js';
import { routes } from '$lib/routes.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';
import { useFriendship } from '$lib/hooks/friends/useFriendship.svelte.js';
import type { User, Avatar as AvatarData } from '$lib/api/auth.js';

/**
 * Someone else's profile screen. Route-bound, so it reads `page` itself.
 *
 * A restricted profile still resolves — the server answers with the name and a
 * `profileRestricted` flag instead of an error — so that case is a render mode,
 * not a load error.
 */
export function useUserProfile() {
	const t = $derived(i18n.t);

	let user = $state<User | null>(null);
	let avatars = $state<AvatarData[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let restricted = $state(false);
	let pendingRemove = $state(false);

	const userId = $derived(page.params.id!);
	const isMe = $derived(userId === auth.user?.id);
	const displayName = $derived(user?.displayName ?? user?.username ?? '?');

	const friendship = useFriendship(() => (isMe ? undefined : userId));

	$effect(() => {
		if (auth.loading) return;
		const id = userId;
		untrack(() => {
			void load(id);
		});
	});

	async function load(id: string) {
		loading = true;
		loadError = null;
		restricted = false;
		try {
			const [userData, avatarData] = await Promise.all([
				userService.getById(id),
				userService.getAvatars(id),
			]);
			user = userData.user;
			restricted = !!(userData.user as User & { profileRestricted?: boolean }).profileRestricted;
			avatars = restricted ? [] : avatarData.avatars;
		} catch (err) {
			console.error('[useUserProfile] load failed', err);
			loadError = t.chat.userNotFound;
		} finally {
			loading = false;
		}
	}

	// Presence arrives on the socket rather than with the profile, so the dot
	// keeps up without a refetch.
	onDestroy(
		ws.on((event) => {
			const e = event as { type: string; userId?: string; online?: boolean };
			if (e.type !== 'presence' || e.userId !== userId || !user) return;
			user = { ...user, isOnline: !!e.online };
		}),
	);

	return {
		get userId() { return userId; },
		get user() { return user; },
		get avatars() { return avatars; },
		get displayName() { return displayName; },
		get loading() { return loading; },
		get loadError() { return loadError; },
		get restricted() { return restricted; },
		get isMe() { return isMe; },
		get friendship() { return friendship; },
		// Set while the undo bar counts down; the removal only reaches the server
		// if the bar times out un-cancelled.
		get pendingRemove() { return pendingRemove; },
		startRemove() { pendingRemove = true; },
		cancelRemove() { pendingRemove = false; },
		commitRemove() {
			pendingRemove = false;
			void friendship.removeFriend();
		},
		message() { goto(routes.chats.perschatUser(userId)); },
		editProfile() { goto(routes.profile.root); },
	};
}
