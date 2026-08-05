<script lang="ts" generics="TMsg extends ChatMessage = ChatMessage, TAtt extends ChatAttachment = ChatAttachment">
	import type { Snippet } from 'svelte';
	import { toasts } from '$lib/stores/toasts.svelte.js';
	import type { WsEvent } from '$lib/stores/ws.svelte.js';
	import type {
		ChatAttachment,
		ChatMessage,
		ChatPanelCache,
		ChatPanelEvent,
		ChatService,
	} from '$lib/chat/types.js';
	import TextField from '$lib/components/ui/TextField.svelte';
	import ChatPanelBubble, { type ChatRowActions } from '$lib/components/chat/ChatPanelBubble.svelte';
	import ChatPanelModals from '$lib/components/chat/ChatPanelModals.svelte';
	import MessageList from '$lib/components/chat/MessageList.svelte';
	import SelectionToolbar from '$lib/components/chat/SelectionToolbar.svelte';
	import { useChatPanel } from '$lib/hooks/chat/useChatPanel.svelte.js';
	import { useChatPanelDialogs } from '$lib/hooks/chat/useChatPanelDialogs.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		/** Service-call key: a group id for group chat, a channel id for voice chat. */
		id: string;
		/**
		 * Blob-scope owner for uploads. Voice channels share the parent group's
		 * scope, so this is the group id there too; defaults to `id`.
		 */
		uploadId?: string;
		service: ChatService<TMsg, TAtt>;
		/** Warm cache for this surface — each surface owns its own Map. */
		cache: Map<string, ChatPanelCache>;
		/**
		 * Narrows the socket firehose to this surface's events, normalised, so
		 * nothing below cares which kind of chat this is.
		 */
		matchEvent: (e: WsEvent) => ChatPanelEvent | null;
		reactorLookup?: (userId: string) => { name: string; avatarUrl: string | null } | null;
		inputPlaceholder?: string;
		/** After the first load resolves — callers mark the chat read locally, etc. */
		onLoaded?: () => void;
		/** A message arrived over the socket, for callers keeping their own previews. */
		onMessageReceived?: (msg: ChatMessage) => void;

		/**
		 * The emoji panel's open state, and a way in. Callers render the picker
		 * themselves — its position differs per surface — then push the choice
		 * into our TextField through `insertAtCursor`.
		 */
		emojiOpen?: boolean;
		insertAtCursor?: ((emoji: string) => void) | null;

		/**
		 * Float the composer over the scroller instead of stacking it below.
		 * Surfaces that overlay their header want this; the voice-channel side
		 * panel keeps its chrome in normal flow and leaves it off.
		 */
		overlayChrome?: boolean;
		header?: Snippet;
	}

	let {
		id,
		uploadId,
		service,
		cache,
		matchEvent,
		reactorLookup,
		inputPlaceholder,
		onLoaded,
		onMessageReceived,
		emojiOpen = $bindable(false),
		insertAtCursor = $bindable<((emoji: string) => void) | null>(null),
		overlayChrome = false,
		header,
	}: Props = $props();

	const chat = useChatPanel({
		id: () => id,
		uploadId: () => uploadId ?? id,
		service: () => service,
		cache: () => cache,
		matchEvent: (e) => matchEvent(e),
		onLoaded: () => onLoaded?.(),
		onMessageReceived: (msg) => onMessageReceived?.(msg),
	});

	const selection = $derived(chat.selection);
	const messages = $derived(chat.messages);
	const dialogs = useChatPanelDialogs();

	let textField = $state<ReturnType<typeof TextField>>();

	// Bridge the inner TextField's insertAtCursor out through the bindable prop,
	// so callers get a stable reference whenever the field is mounted.
	$effect(() => {
		insertAtCursor = textField ? (emoji: string) => textField!.insertAtCursor(emoji) : null;
	});

	// What this surface can do to a message, built once rather than closed over
	// per row.
	const rowActions: ChatRowActions = {
		edit: (id, content) => chat.editMessage(id, content),
		remove: (id) => chat.deleteMessage(id),
		pin: (id) => chat.pin(id),
		unpin: (id) => chat.unpin(id),
		react: (id, emoji) => chat.react(id, emoji),
		openEmoji: (id) => dialogs.openReactionPicker(id),
		openMedia: (attachments, index) => dialogs.openMedia(attachments, index),
		// Forwarding one message forwards a selection of exactly it.
		forward: (id) => {
			selection.selectOnly(id);
			dialogs.openForward();
		},
	};
</script>

<div class="chat-panel" class:overlay-chrome={overlayChrome}>
	{#if header}
		{@render header()}
	{/if}

	<MessageList
		items={messages}
		loading={chat.loading}
		loadingOlder={chat.loadingOlder}
		bind:container={chat.container}
		pinnedToBottom={chat.pinnedToBottom}
		jumpButtonBottom="8px"
		{selection}
		onscroll={chat.handleScroll}
		onjumptobottom={chat.scrollToBottom}
	>
		{#snippet row(msg, i)}
			{#if msg.systemKind}
				<div class="system-msg body-xs text-faint">{msg.content}</div>
			{:else}
				<ChatPanelBubble
					{msg}
					hideAvatar={i < messages.length - 1
						&& messages[i + 1].authorId === msg.authorId
						&& !messages[i + 1].systemKind}
					{selection}
					{reactorLookup}
					actions={rowActions}
				/>
			{/if}
		{/snippet}
	</MessageList>

	<div class="chat-input">
		{#if selection.selecting}
			<SelectionToolbar
				count={selection.selectedIds.size}
				onforward={dialogs.openForward}
				ondelete={chat.deleteSelected}
				oncancel={() => selection.clear()}
			/>
		{:else}
			{#key id}
				<TextField
					bind:this={textField}
					placeholder={inputPlaceholder ?? t.chat.messagePlaceholder}
					onsubmit={chat.send}
					emojiOpen={emojiOpen}
					onemojitoggle={() => (emojiOpen = !emojiOpen)}
					onvoice={chat.sendVoice}
					onvoiceerror={(m) => toasts.error(m)}
				/>
			{/key}
		{/if}
	</div>
</div>


<ChatPanelModals
	{dialogs}
	onreact={(messageId, emoji) => void chat.react(messageId, emoji)}
	onforward={(target) => void chat.forward(target)}
/>

<style lang="scss">
	@use '$lib/styles/modal.mixin' as *;
	@use '$lib/styles/glass.mixin' as *;
	@use '$lib/styles/chat-layout.mixin' as *;

	.chat-panel {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		/* min-height: 0 so internal scrollers (chat-messages) can size relative
		 * to the available flex space instead of intrinsic content size. Without
		 * this, the panel grows to fit all messages and the global .page-area
		 * scroller takes over instead of the messages container's own one. */
		min-height: 0;
		/* Containing block for the overlaid composer, so it anchors to the panel
		 * rather than escaping to the viewport. */
		position: relative;
	}

	/* In-flow chrome has nothing to clear, so drop the header-height gap the
	 * shared layout reserves by default. */
	.chat-panel:not(.overlay-chrome) {
		--chat-list-clearance: var(--sp-4);
	}

	.system-msg {
		align-self: center;
		padding: var(--sp-1) var(--sp-3);
		background: var(--c-bg-2);
		border-radius: var(--radius-md);
	}

	.chat-input { flex-shrink: 0; margin: 0 12px 0; }

	.overlay-chrome .chat-input {
		@include chat-composer-overlay;
	}

	:global(.bubble.highlight-flash),
	:global(.bubble-row.highlight-flash) {
		animation: highlight-flash 1.6s var(--ease-default);
	}

	@keyframes highlight-flash {
		0%, 100% { background: transparent; }
		20% { background: color-mix(in srgb, var(--c-accent) 20%, transparent); }
	}
</style>
