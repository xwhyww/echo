<script lang="ts">
	import '$lib/styles/tokens.css';
	import '$lib/styles/reset.css';
	import '$lib/styles/utilities.css';
	import '$lib/styles/fonts.css';
	import favicon from '$lib/assets/favicon.svg';
	import Sidebar from '$lib/components/sidebar/Sidebar.svelte';
	import Header from '$lib/components/layouts/Header.svelte';
	import { getActiveSidebar } from '$lib/stores/sidebar.svelte.js';
	import { HOME, routes, isChatRoute } from '$lib/routes.js';
	import IncomingCallModal from '$lib/components/call/IncomingCallModal.svelte';
	import ToastHost from '$lib/components/ui/ToastHost.svelte';
	import ConfirmHost from '$lib/components/ui/ConfirmHost.svelte';
	import AppBars from '$lib/components/layouts/AppBars.svelte';
	import CallScreen from '$lib/components/call/CallScreen.svelte';
	import { useAuthGuard } from '$lib/hooks/auth/useAuthGuard.svelte.js';
	import { useKeyboardDismiss } from '$lib/hooks/ui/useKeyboardDismiss.svelte.js';
	import { chatHeader } from '$lib/stores/chatHeader.svelte.js';
	import { usePushRegistration } from '$lib/hooks/auth/usePushRegistration.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import { page } from '$app/state';

	let { children } = $props();

	const guard = useAuthGuard();
	// Outside the guard on purpose: the login code field needs it too.
	useKeyboardDismiss();
	// Waits for sign-in itself, then registers this install for notifications.
	usePushRegistration();
	const activeSidebar = $derived(getActiveSidebar());
	const settingsMode = $derived(activeSidebar === 'settings');
	const t = $derived(i18n.t);

	// Exact route → header title (labels match the corresponding nav items).
	const routeTitles = $derived<Record<string, string>>({
		[routes.settings]: t.settings.title,
		[routes.profile.root]: t.settings.myAccount,
		[routes.profile.privacy]: t.settings.privacy,
		[routes.profile.notifications]: t.settings.notifications,
		[routes.profile.groups]: t.settings.groups,
		[routes.profile.audio]: t.settings.microphone,
		[routes.profile.language]: t.settings.language,
		[routes.friends.root]: t.nav.friends,
		[routes.friends.incoming]: t.nav.incomingRequests,
		[routes.friends.outgoing]: t.nav.outgoingRequests,
		[routes.chats.groupsInvites]: t.nav.invites,
	});

	// Section fallback for dynamic routes (open chat, /user/[id], …) where
	// the last path segment is an id, not a name.
	const sectionTitles = $derived<Record<string, string>>({
		pc: t.nav.personalChats,
		gr: t.nav.groups,
		ac: t.nav.allChats,
		friends: t.nav.friends,
		settings: t.settings.title,
	});
	const headerTitle = $derived(
		routeTitles[page.url.pathname] ?? (activeSidebar ? sectionTitles[activeSidebar] : ''),
	);

	// Mobile screen modes. Desktop shows rail + list + main side by side; a
	// phone fits exactly one screen at a time:
	//   m-detail  — an open chat/user ([id] route): main fullscreen, no nav
	//   m-content — friends/profile pages: the page is the screen, list hidden
	//   default   — list screens (chat sections, /settings): the list is the screen
	const mobileDetail = $derived(!!page.params.id);
	const mobileContent = $derived(
		!mobileDetail &&
			(activeSidebar === 'friends' ||
				(activeSidebar === 'settings' && page.url.pathname !== '/settings')),
	);

	// An open chat ([id]) is a fullscreen surface: no header, no sidebar.
	const hideChrome = $derived(isChatRoute(page.route.id));

	// …except that a personal chat now puts its header in the app bar rather
	// than floating one over its own scroller, so the bar comes back for it. The
	// sidebar stays hidden: the conversation is still the whole screen below.
	const hasChatHeader = $derived(!!chatHeader.current);

	// The chat list is the root of its section — HOME points at the page you are
	// already on. Showing a back arrow there, and answering a back swipe, both
	// promise a "somewhere behind this" that does not exist. The rail's filter
	// tabs are query strings on this same route, so the pathname is the test.
	const atChatsRoot = $derived(page.url.pathname === routes.chats.root || page.url.pathname === routes.settings);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
</svelte:head>


{#if guard.showSidebar}
	<div class="app-shell" class:settings-mode={settingsMode} class:m-detail={mobileDetail} class:m-content={mobileContent}>
		{#if !hideChrome || hasChatHeader}
			<Header backHref={atChatsRoot ? null : HOME} title={headerTitle} />
		{/if}
		
		<AppBars />

		{#if !hideChrome}
			<Sidebar />
		{/if}
		<!-- data-swipe-surface: what the back gesture slides, so an accidental
		     swipe is visible while there is still time to drag back out of it.
		     See useSwipeBack.svelte.ts. -->
		<div class="children" data-swipe-surface>
			{@render children()}
		</div>
		<!-- App-wide floating bars (player / voice status / pinned messages).
		     They live here so they outlive the page that opened them and so the
		     stack can keep them from overlapping each other. -->
	</div>
	<IncomingCallModal />
{:else}
	{@render children()}
{/if}

<ToastHost />
<ConfirmHost />

<style>
	.app-shell {
		display: flex;
		height: 100svh;
		width: 100%;
		overflow: hidden;
		align-items: center;
		flex-direction: column;
		padding: var(--safe-top) var(--sp-2) var(--safe-bottom) var(--sp-2);
		

		background-image: linear-gradient(rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.8)),
		url('/chat-bg/chat-bg-1.jpg');
		background-size: cover, 200%;
		background-position: center, center;
		background-repeat: no-repeat, repeat;
		
		.children {
			width: 100%;
			height: 100%;
		}
	}
	
</style>
