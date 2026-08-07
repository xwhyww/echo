<script lang="ts">
	import { Users } from 'lucide-svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import BackButton from '$lib/components/ui/BackButton.svelte';
	import Status from '$lib/components/user/Status.svelte';
	import TypingIndicator from '$lib/components/chat/TypingIndicator.svelte';
	import UserInfo from '$lib/components/user/UserInfo.svelte';
	import { useSwipeBack } from '$lib/hooks/ui/useSwipeBack.svelte.js';
	import { chatHeader } from '$lib/stores/chatHeader.svelte.js';
	import { auth } from '$lib/stores/auth.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	interface Props {
		// Fallback destination: landing on the page directly (deep link,
		// reload) leaves no history to go back to.
		//
		// Null for a screen that is not somewhere you arrived *from* — the chat
		// list is the root of its section, so it shows no arrow and answers no
		// swipe. Both affordances hang off this one prop so they cannot drift
		// apart.
		backHref?: string | null;
		title?: string;
	}

	let { backHref = null, title = '' }: Props = $props();

	const t = $derived(i18n.t);

	// The touch equivalent of the back button beside it. Mounts nothing when
	// there is no button.
	useSwipeBack(() => backHref);

	// An open chat fills the bar with its own contents — who you are talking to
	// and their presence, or the group and its size — in place of the page
	// title. It is published by the chat page rather than rendered by it, so the
	// bar keeps one back button and one swipe for every screen.
	const chat = $derived(chatHeader.current);

	// Saved messages has no companion, so the avatar is our own — without this
	// the fallback initial ('?') is all UserInfo has to draw.
	const avatarOf = $derived(
		chat?.kind === 'personal' ? (chat.isSelf ? auth.user : chat.companion) : null,
	);

	// Tapping the bar opens the chat info — except on the back button, which has
	// somewhere else to be.
	function onclick(e: MouseEvent) {
		if (!chat) return;
		if ((e.target as HTMLElement | null)?.closest('.header-back')) return;
		chat.onopeninfo();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<header class="app-header" class:has-chat={!!chat} {onclick}>
	{#if backHref}
		<div class="header-back">
			<BackButton {backHref} size={48} />
		</div>
	{/if}

	{#if chat?.kind === 'personal'}
		<div class="header-center">
			<h4 class="body-xs fw-medium">
				{chat.isSelf ? t.chat.notes : (chat.title ?? chat.companion?.username ?? '')}
			</h4>
			{#if chat.isSelf}
				<span class="body-xs text-faint">{t.chat.chatWithYourself}</span>
			{:else if (chat.typingUsers ?? []).length > 0}
				<!-- Typing is the more current fact about someone than online is, and
				     they'd say the same thing twice standing side by side. -->
				<TypingIndicator users={chat.typingUsers ?? []} />
			{:else if chat.companion}
				<span class="presence body-xs text-faint" class:online={chat.companion.isOnline}>
					<Status status={chat.companion.isOnline ? 'online' : 'offline'} size={6} />
					<span>{chat.companion.isOnline ? t.common.online : t.common.offline}</span>
				</span>
			{/if}
		</div>

		<div class="header-user">
			<UserInfo
				displayName={avatarOf?.displayName}
				username={avatarOf?.username}
				avatarUrl={avatarOf?.avatarUrl}
				showName={false}
				size="mm"
			/>
		</div>
	{:else if chat?.kind === 'group'}
		<div class="header-center">
			<h4 class="body-xs fw-medium">{chat.group?.name ?? '...'}</h4>
			<span class="members body-xs text-faint">
				<Users size={12} />
				<span>{t.groupInfo.memberCount(chat.memberCount)}</span>
			</span>
		</div>

		<div class="header-user">
			<!-- A target of its own inside a bar that opens the group info: the
			     avatar goes one level deeper, to the settings. -->
			<button
				class="avatar-btn"
				onclick={(e) => {
					e.stopPropagation();
					chat.onopensettings();
				}}
				title={t.groupInfo.groupSettings}
				aria-label={t.groupInfo.groupSettings}
			>
				<Avatar name={chat.group?.name ?? '?'} avatarUrl={chat.group?.avatarUrl ?? null} size={36} />
			</button>
		</div>
	{:else if title}
		<h2 class="title body-base">{title}</h2>
		<div class="empty"></div>
	{/if}
</header>

<style>
	/* The header sits at the very top edge, so on a phone the status bar/notch
	   overlaps it. It keeps its own height and wears the inset as padding — the
	   bar grows taller, the content inside it stays put. */
	.app-header {
		height: calc(var(--header-h) + var(--safe-top));
		width: 100%;
		padding-right: var(--sp-2);
		padding-left: var(--sp-2);
		flex-shrink: 0;
		display: flex;
		align-items: flex-end;
		gap: var(--sp-2);
		/* Scrim so content scrolling under the header stays legible. */
		background: linear-gradient(
			to bottom,
			rgba(0, 0, 0, 1),
			rgba(0, 0, 0, 0.8) 80%,
			rgba(0, 0, 0, 0)
		);
		position: fixed;
		top: 0;
		z-index: 2;
	}

	/* The back button is out of flow, so the chat's own contents have to leave
	   room for it themselves. */
	.app-header.has-chat {
		cursor: pointer;
	}


	.title {
		text-align: center;
		width: 100%;
		margin-bottom: 10px;
	}

	.header-center {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}

	.header-center h4 {
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}

	.header-user {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	.presence,
	.members {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
	}

	.avatar-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-full);
		background: transparent;
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);
	}

	.presence.online {
		color: var(--c-online, var(--c-text-muted));
	}
</style>
