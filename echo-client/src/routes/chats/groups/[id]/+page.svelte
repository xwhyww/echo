<script lang="ts">
	import ChatPanel from '$lib/components/chat/ChatPanel.svelte';
	import EmojiPicker from '$lib/components/emoji/EmojiPicker.svelte';
	import { groupsService } from '$lib/api/groupsService.js';
	import { groupChatPanelCaches } from '$lib/hooks/chat/useGroupChatCache.svelte.js';
	import { useGroupChatPage } from '$lib/hooks/chat/useGroupChatPage.svelte.js';
	import { chatHeader } from '$lib/stores/chatHeader.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	const groupChat = useGroupChatPage();

	let emojiOpen = $state(false);
	let insertAtCursor = $state<((emoji: string) => void) | null>(null);

	// The header is drawn by the root layout, so what belongs in it is published
	// rather than rendered — see `chatHeader`. Cleared on the way out, or the
	// next screen would inherit this group's title.
	$effect(() => {
		chatHeader.set({
			kind: 'group',
			group: groupChat.group,
			memberCount: groupChat.members.length,
			onopeninfo: groupChat.openInfo,
			onopensettings: groupChat.openSettings,
		});
		return () => chatHeader.clear();
	});
</script>

<!-- Not a PageColumn: a conversation fills the viewport and scrolls its own
     message list rather than stacking sections down a column. -->
<div class="chat-layout">
	<div class="chat-page">
		{#key groupChat.groupId}
			<ChatPanel
				id={groupChat.groupId}
				service={groupsService}
				cache={groupChatPanelCaches}
				matchEvent={groupChat.matchEvent}
				reactorLookup={groupChat.reactorLookup}
				inputPlaceholder={groupChat.group
					? t.chat.messageTo(groupChat.group.name)
					: t.chat.messagePlaceholder}
				overlayChrome
				bind:emojiOpen
				bind:insertAtCursor
			/>
		{/key}
	</div>

	{#if emojiOpen}
		<div class="emoji-sidebar">
			<EmojiPicker onselect={(emoji) => insertAtCursor?.(emoji)} />
		</div>
	{/if}
</div>

<style>
	.chat-layout {
		display: flex;
		height: 100%;
		width: 100%;
	}

	.chat-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		flex: 1;
		min-width: 0;
		/* The header is in the app bar above this page now, not floating over the
		   scroller, so the list no longer has to leave a hole for it. */
		--chat-list-top-clearance: var(--sp-4);
		/* Containing block for the overlaid composer. */
		position: relative;
		background-image: linear-gradient(rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.8)),
			url('/chat-bg/chat-bg-1.jpg');
		background-size: cover, 200%;
		background-position: center, center;
		background-repeat: no-repeat, repeat;
	}

	/* Sits beside the conversation rather than over it — the group page has the
	   width for it, unlike the personal chat's overlay picker. */
	.emoji-sidebar {
		width: 352px;
		flex-shrink: 0;
		border-left: 1px solid var(--c-border);
		height: 100%;
		overflow: hidden;
	}
</style>
