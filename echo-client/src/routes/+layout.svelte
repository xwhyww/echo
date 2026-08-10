<script lang="ts">
	import '$lib/styles/tokens.css';
	import '$lib/styles/reset.css';
	import '$lib/styles/utilities.css';
	import '$lib/styles/fonts.css';
	import favicon from '$lib/assets/favicon.svg';
	import Sidebar from '$lib/components/sidebar/Sidebar.svelte';
	import ChatsSidebar from '$lib/components/sidebar/ChatsSidebar.svelte';
	import SettingsSidebar from '$lib/components/sidebar/SettingsSidebar.svelte';
	import Header from '$lib/components/layouts/Header.svelte';
	import { getActiveSidebar } from '$lib/stores/sidebar.svelte.js';
	import {
		HOME,
		routes,
		isChatRoute,
		isVoiceChannelChatRoute,
		isVoiceChannelRoute,
	} from '$lib/routes.js';
	import IncomingCallModal from '$lib/components/call/IncomingCallModal.svelte';
	import ToastHost from '$lib/components/ui/ToastHost.svelte';
	import ConfirmHost from '$lib/components/ui/ConfirmHost.svelte';
	import AppBars from '$lib/components/layouts/AppBars.svelte';
	import CallScreen from '$lib/components/call/CallScreen.svelte';
	import { useAuthGuard } from '$lib/hooks/auth/useAuthGuard.svelte.js';
	import { useKeyboardDismiss } from '$lib/hooks/ui/useKeyboardDismiss.svelte.js';
	import { useBootCover } from '$lib/hooks/ui/useBootCover.svelte.js';
	import { chatHeader } from '$lib/stores/chatHeader.svelte.js';
	import { usePushRegistration } from '$lib/hooks/auth/usePushRegistration.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import { page } from '$app/state';

	let { children } = $props();

	const guard = useAuthGuard();
	// Takes down the black cover app.html paints over the cold start.
	useBootCover();
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

	// A profile page belongs to the settings section: back leads to the settings
	// menu, not to the chat list. `/settings` itself is that menu, so it is not
	// included — there is nothing behind it to show.
	const inProfile = $derived(
		page.url.pathname === routes.profile.root || page.url.pathname.startsWith(`${routes.profile.root}/`),
	);

	/**
	 * The two voice surfaces reveal nothing behind them, and both for the same
	 * reason: what they go back to is a page, not a list.
	 *
	 * A channel's chat returns to the channel stage — a live LiveKit connection,
	 * which cannot be mounted a second time as a backdrop. The stage itself now
	 * returns to the group's chat, a whole conversation with its own state and
	 * scroll. Revealing the chat list under either would uncover one screen and
	 * land on another, which is worse than revealing nothing.
	 */
	const inVoice = $derived(
		isVoiceChannelRoute(page.route.id) || isVoiceChannelChatRoute(page.route.id),
	);
	const inVoiceChannelChat = $derived(isVoiceChannelChatRoute(page.route.id));

	// Anything with a screen worth revealing while it is dragged aside.
	const hasRevealLayer = $derived((hideChrome && !inVoice) || inProfile);

	// …except that a personal chat now puts its header in the app bar rather
	// than floating one over its own scroller, so the bar comes back for it. The
	// sidebar stays hidden: the conversation is still the whole screen below.
	const hasChatHeader = $derived(!!chatHeader.current);

	// The chat list is the root of its section — HOME points at the page you are
	// already on. Showing a back arrow there, and answering a back swipe, both
	// promise a "somewhere behind this" that does not exist. The rail's filter
	// tabs are query strings on this same route, so the pathname is the test.
	const atChatsRoot = $derived(page.url.pathname === routes.chats.root || page.url.pathname === routes.settings);

	// Where the arrow leads. A channel's chat is the one chat surface whose way
	// back is not the chat list: it belongs to the channel it was opened from.
	const backHref = $derived(
		atChatsRoot
			? null
			: inVoiceChannelChat
				? routes.chats.groupVoiceChannel(page.params.id!, page.params.channelId!)
				: inProfile
					? routes.settings
					: HOME,
	);
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
			<!-- The fallback destination has to name the same screen the reveal
			     layer shows, or a swipe uncovers one page and lands on another. -->
			<Header {backHref} title={headerTitle} />
		{/if}
		
		<AppBars />

		{#if !hideChrome}
			<Sidebar />
		{/if}
		<div class="page-area">
			{#if hasRevealLayer}
				<!-- The screen the back gesture leads to, mounted underneath the one
				     you are dragging. The chat surface above is opaque, so this is
				     invisible until the swipe moves it — and then the list is
				     already in place instead of appearing once navigation lands.

				     Only the surfaces whose destination is a *list* get one; see
				     `inVoice` above for the two that get nothing. Revealing the
				     wrong screen would be worse than revealing none. -->
				<div class="reveal-layer" aria-hidden="true">
					{#if inProfile}
						<!-- Matches how /settings renders it, so what appears from
						     under the page is the screen you actually land on. -->
						<div class="reveal-settings">
							<SettingsSidebar />
						</div>
					{:else}
						<ChatsSidebar />
					{/if}
				</div>
			{/if}

			<!-- data-swipe-surface: what the back gesture slides, so an accidental
			     swipe is visible while there is still time to drag back out of it.
			     See useSwipeBack.svelte.ts. -->
			<div class="children" data-swipe-surface>
				{@render children()}
			</div>
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
		padding: 0 var(--sp-2) 0 var(--sp-2);

		background-image: linear-gradient(rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.8)),
		url('/chat-bg/chat-bg-1.jpg');
		background-size: cover, 200%;
		background-position: center, center;
		background-repeat: no-repeat, repeat;
		
		/* Owns the stacking for the back gesture: the destination sits at the
		   bottom, the page you are dragging on top of it. Positioned here rather
		   than on .app-shell so the header stays out of the contest entirely. */
		.page-area {
			position: relative;
			flex: 1;
			min-height: 0;
			width: 100%;
			/* A flex column, so the page inside is sized by flex rather than by a
			   percentage of it. WebKit will not resolve `height: 100%` against an
			   ancestor whose own height came from `flex: 1` — it falls back to
			   auto, the page grows to fit its content instead of scrolling, and
			   .app-shell's `overflow: hidden` clips whatever does not fit. Chrome
			   resolves it, which is why this only ever broke on the phone. */
			display: flex;
			flex-direction: column;
		}

		/* Mirrors the .empty-state wrapper on /settings. */
		.reveal-settings {
			display: flex;
			align-items: center;
			justify-content: center;
			height: 100%;
			width: 100%;
		}

		.reveal-layer {
			position: absolute;
			inset: 0;
			z-index: 0;
			/* Covered until a swipe moves the page off it, so it must never take
			   a tap meant for what is on top. */
			pointer-events: none;
			overflow: hidden;
		}

		.children {
			/* Positioned, but deliberately *without* a z-index. Both this and
			   .reveal-layer are positioned, so tree order already paints this on
			   top — while a z-index here would open a stacking context and trap
			   everything inside it. Modals are fixed at --z-modal (2000) expecting
			   to clear the header and the app bars, which sit at 2; trapped, they
			   would render underneath both. AppBars carries the same warning. */
			position: relative;
			width: 100%;
			/* Sized by flex, not by `height: 100%`, for the reason on .page-area.
			   `min-height: 0` is what lets it shrink below its content so the
			   scroller inside can take over. */
			display: flex;
			flex-direction: column;
			flex: 1;
			min-height: 0;
		}
	}
	
</style>
