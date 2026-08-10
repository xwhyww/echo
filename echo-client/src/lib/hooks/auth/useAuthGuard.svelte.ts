import { auth } from '$lib/stores/auth.svelte.js';
import { ws } from '$lib/stores/ws.svelte.js';
import { friendsStore } from '$lib/stores/friends.svelte.js';
import { page } from '$app/state';
import { goto } from '$app/navigation';
import { onMount } from 'svelte';
import { routes, HOME, PUBLIC_PAGES } from '$lib/routes.js';

export function useAuthGuard() {
	let isPublicPage = $derived(PUBLIC_PAGES.includes(page.url.pathname));
	let showSidebar = $derived(!auth.loading && auth.isAuthenticated && !isPublicPage);

	onMount(() => {
		auth.init();
	});

	// Connect/disconnect WebSocket based on auth state.
	//
	// Depends on the token and nothing else. `isAuthenticated` also reads
	// `auth.user`, so any refresh of the profile object — a new avatar, a
	// presence update — used to re-run this and reconnect a socket that was
	// perfectly healthy. Waiting for `loading` is what `isAuthenticated`
	// really bought us here: the token is set before `/auth/me` resolves, and
	// `loading` only clears once the user is in.
	$effect(() => {
		if (auth.loading) return;
		const token = auth.token;
		if (token) {
			ws.connect(token);
			friendsStore.init();
		} else {
			ws.disconnect();
			friendsStore.reset();
		}
	});

	// Keep friendship statuses + incoming count in sync via WS
	$effect(() => {
		if (!auth.isAuthenticated) return;
		const unsub = ws.on((event) => {
			if (event.type === 'friend_request') {
				// Inbound request — track in LRU so badge counts even if the user
				// hasn't been observed before.
				friendsStore.setStatus(event.fromUserId, { status: 'pending', direction: 'incoming' });
			} else if (event.type === 'friend_accepted') {
				friendsStore.setStatus(event.fromUserId, { status: 'friends' });
			} else if (event.type === 'friend_removed' || event.type === 'friend_declined' || event.type === 'friend_cancelled') {
				friendsStore.removeStatus(event.fromUserId);
			}
		});
		return unsub;
	});

	// Route protection.
	//
	// Both redirects replace rather than push: they are corrections to a page the
	// user should never have been on, not places they navigated to. Pushing would
	// leave that page sitting in the back stack for the back button to return to,
	// where the same guard would immediately bounce them off it again.
	$effect(() => {
		if (auth.loading) return;

		if (!auth.isAuthenticated && !isPublicPage) {
			goto(routes.login, { replaceState: true });
		}

		if (auth.isAuthenticated && (page.url.pathname === routes.login || page.url.pathname === routes.register)) {
			goto(HOME, { replaceState: true });
		}
	});

	return {
		get showSidebar() { return showSidebar; },
		/**
		 * Whether the session question has been answered yet. The layout renders
		 * `children()` on both sides of `showSidebar`, so anything drawn before
		 * this is true gets mounted once under the signed-out branch and again
		 * under the signed-in one — every page effect run twice, every fetch on
		 * open sent twice. Nothing is on screen during the wait anyway: the boot
		 * cover from `app.html` is still up (see `useBootCover`).
		 */
		get ready() { return !auth.loading; },
	};
}
