<script lang="ts">
	import { onDestroy } from 'svelte';
	import ChatPanel from '$lib/components/chat/ChatPanel.svelte';
	import EmojiPicker from '$lib/components/emoji/EmojiPicker.svelte';
	import { voiceChatService } from '$lib/api/voiceChatService.js';
	import { voiceChannelChatCaches } from '$lib/hooks/voice/useVoiceChannelChatCache.svelte.js';
	import { useVoiceChannelChatPage } from '$lib/hooks/voice/useVoiceChannelChatPage.svelte.js';
	import { chatHeader } from '$lib/stores/chatHeader.svelte.js';
	import { device } from '$lib/stores/device.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { VoiceChannelMessage } from '$lib/api/voiceChat.js';

	const t = $derived(i18n.t);

	const chat = useVoiceChannelChatPage();

	let emojiOpen = $state(false);
	let insertAtCursor = $state<((emoji: string) => void) | null>(null);

	// The header is drawn by the root layout, so what belongs in it is published
	// rather than rendered — see `chatHeader`.
	$effect(() => {
		chatHeader.set({
			kind: 'voice',
			channelName: chat.channelName,
			groupName: chat.groupName,
		});
	});

	// Cleared on the way out, or the next screen would inherit this channel's
	// name. This cannot be the effect's teardown: that also runs before every
	// re-run, so resolving the channel name blanked the header state the layout
	// is reading mid-flush.
	onDestroy(() => chatHeader.clear());
</script>

<!-- Not a PageColumn: a conversation fills the viewport and scrolls its own
     message list rather than stacking sections down a column. Same shape as the
     group chat next door — this used to be a side panel with a header of its
     own, and there was no reason for it to be a different kind of screen. -->
<div class="chat-layout">
	<div class="chat-page">
		{#key chat.channelId}
			<ChatPanel
				id={chat.channelId}
				uploadId={chat.groupId}
				service={voiceChatService}
				cache={voiceChannelChatCaches}
				matchEvent={chat.matchEvent}
				reactorLookup={chat.reactorLookup}
				inputPlaceholder={chat.channelName
					? t.voice.channelChat.channelPlaceholder(chat.channelName)
					: t.chat.messagePlaceholder}
				onMessageReceived={(msg) => chat.trackMessage(msg as VoiceChannelMessage)}
				overlayChrome
				bind:emojiOpen
				bind:insertAtCursor
			/>
		{/key}
	</div>

	<!-- See `TextField`: no picker on a phone, where the soft keyboard has an
	     emoji key of its own. -->
	{#if emojiOpen && !device.isTouch}
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
		/* The header is in the app bar above this page, not floating over the
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

	/* Beside the conversation rather than over it, as on the group page. */
	.emoji-sidebar {
		width: 352px;
		flex-shrink: 0;
		border-left: 1px solid var(--c-border);
		height: 100%;
		overflow: hidden;
	}
</style>
