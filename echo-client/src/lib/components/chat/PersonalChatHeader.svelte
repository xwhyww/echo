<script lang="ts">
	import BackButton from '$lib/components/ui/BackButton.svelte';
	import Status from '$lib/components/user/Status.svelte';
	import TypingIndicator from '$lib/components/chat/TypingIndicator.svelte';
	import UserInfo from '$lib/components/user/UserInfo.svelte';
	import { auth } from '$lib/stores/auth.svelte.js';
	import { routes } from '$lib/routes.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { PersonalChatUser } from '$lib/api/personalChats.js';

	const t = $derived(i18n.t);

	// No `useSwipeBack` here: this renders inside the app `Header`, which mounts
	// the gesture itself. Two mounts would answer one swipe twice and step back
	// two entries.

	// The bar above a personal conversation. Tapping it opens the chat info —
	// except on the back button, which has somewhere else to be.
	interface Props {
		/** Null in the saved-messages chat, and until the chat has loaded. */
		companion: PersonalChatUser | null;
		isSelf: boolean;
		/** Falls back to the companion's own name while the chat is resolving. */
		title: string | null;
		/** Whoever is typing right now — it takes the presence line's place. */
		typingUsers?: { username: string }[];
		onopeninfo: () => void;
	}

	let { companion, isSelf, title, typingUsers = [], onopeninfo }: Props = $props();

	// Saved messages has no companion, so the avatar is our own — without this
	// the fallback initial ('?') is all UserInfo has to draw.
	const avatarOf = $derived(isSelf ? auth.user : companion);

	function onclick(e: MouseEvent) {
		if ((e.target as HTMLElement | null)?.closest('.chat-header-back')) return;
		onopeninfo();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- A div, not a header: the app `Header` this sits inside is already the
     <header> for the page. -->
<div class="chat-header" {onclick}>
	<div class="chat-header-back">
		<BackButton backHref={routes.chats.root} size={48} />
	</div>

	<div class="chat-header-center">
		<h4 class="body-xs fw-medium">
			{isSelf ? t.chat.notes : (title ?? companion?.username ?? '')}
		</h4>
		{#if isSelf}
			<span class="body-xs text-faint">{t.chat.chatWithYourself}</span>
		{:else if typingUsers.length > 0}
			<!-- Typing is the more current fact about someone than online is, and
			     they'd say the same thing twice standing side by side. -->
			<TypingIndicator users={typingUsers} />
		{:else if companion}
			<span class="chat-header-presence body-xs text-faint" class:online={companion.isOnline}>
				<Status status={companion.isOnline ? 'online' : 'offline'} size={6} />
				<span>{companion.isOnline ? t.common.online : t.common.offline}</span>
			</span>
		{/if}
	</div>

	<div class="chat-header-user">
		<UserInfo
			displayName={avatarOf?.displayName}
			username={avatarOf?.username}
			avatarUrl={avatarOf?.avatarUrl}
			showName={false}
			size="mm"
		/>
	</div>
</div>

<style lang="scss">
	/* The contents of the app header bar, not a bar of its own: `Header` owns the
	   height, the safe-area inset and the scrim, and this fills it.

	   It used to include `chat-header-overlay` and float over the scroller as
	   fixed chrome, which is why it behaved differently from every other page's
	   header — a fixed element is placed against the layout viewport, and iOS
	   moves that around as the keyboard opens. */
	.chat-header {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		cursor: pointer;
	}

	.chat-header-back,
	.chat-header-user {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	.chat-header-center {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}

	.chat-header-center h4 {
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}

	.chat-header-presence {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
	}

	.chat-header-presence.online {
		color: var(--c-online, var(--c-text-muted));
	}
</style>
