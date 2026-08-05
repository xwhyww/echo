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

	// Connect/disconnect WebSocket based on auth state
	$effect(() => {
		if (auth.loading) return;
		if (auth.isAuthenticated && auth.token) {
			ws.connect(auth.token);
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
	};
}
