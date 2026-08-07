<script lang="ts">
	import { Lock } from 'lucide-svelte';
	import EmojiPicker from '$lib/components/emoji/EmojiPicker.svelte';
	import ReplyPreview from '$lib/components/chat/ReplyPreview.svelte';
	import SelectionToolbar from '$lib/components/chat/SelectionToolbar.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { toasts } from '$lib/stores/toasts.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { usePersonalChat } from '$lib/hooks/chat/usePersonalChat.svelte.js';
	import type { usePersonalChatActions } from '$lib/hooks/chat/usePersonalChatActions.svelte.js';
	import type { useMessageSelection } from '$lib/hooks/chat/useMessageSelection.svelte.js';

	const t = $derived(i18n.t);

	// The bar at the foot of a personal chat. It has four faces: the selection
	// toolbar, a block notice, a privacy notice, or the composer itself.
	interface Props {
		chat: ReturnType<typeof usePersonalChat>;
		actions: ReturnType<typeof usePersonalChatActions>;
		selection: ReturnType<typeof useMessageSelection>;
		/** False when the other person only accepts messages from existing chats. */
		canMessage: boolean;
		/** Remounts the field on navigation so a half-typed draft doesn't follow. */
		resetKey: string;
	}

	let { chat, actions, selection, canMessage, resetKey }: Props = $props();

	let showEmoji = $state(false);
	let textField = $state<ReturnType<typeof TextField>>();

	// The picker is a sidebar beside the composer — once the message is on its
	// way there is nothing left to pick for, so it closes with the send.
	function handleSend(text: string, attachedFiles?: File[]) {
		showEmoji = false;
		return chat.handleSend(text, attachedFiles);
	}

	function handleSendVoice(file: File, meta: Parameters<typeof chat.handleSendVoice>[1]) {
		showEmoji = false;
		return chat.handleSendVoice(file, meta);
	}
</script>

<div class="chat-input">
	{#if selection.selecting}
		<SelectionToolbar
			count={selection.selectedIds.size}
			onforward={actions.forwardSelection}
			ondelete={() => actions.confirmDelete(selection.ids())}
			oncancel={() => selection.clear()}
		/>
	{:else if chat.blockedReason}
		<p class="chat-restricted body-sm text-muted">
			<Lock size={16} />
			<span>{chat.blockedReason}</span>
		</p>
	{:else if canMessage}
		{#if chat.replyingTo}
			<ReplyPreview snapshot={chat.replyingTo.snapshot} oncancel={chat.cancelReply} />
		{/if}
		{#key resetKey}
			<TextField
				bind:this={textField}
				placeholder={t.chat.messageTo(chat.isSelf ? null : chat.chatWith)}
				initialValue={chat.draft}
				onsubmit={handleSend}
				oninput={chat.handleDraftChange}
				emojiOpen={showEmoji}
				onemojitoggle={() => (showEmoji = !showEmoji)}
				onvoice={handleSendVoice}
				onvoiceerror={(m) => toasts.error(m)}
			/>
			{#if showEmoji}
				<div class="emoji-sidebar">
					<EmojiPicker onselect={(e) => textField?.insertAtCursor(e)} />
				</div>
			{/if}
		{/key}
	{:else}
		<p class="chat-restricted body-sm text-muted">
			<Lock size={16} />
			<span>{t.chat.onlyExistingChats}</span>
		</p>
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/chat-layout.mixin' as *;

	.chat-input {
		@include chat-composer-overlay;
	}

	.chat-restricted {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-2);
		margin: 0;
		padding: var(--sp-3) var(--sp-4);
		background: var(--c-bg-2);
		border-radius: var(--radius-md);
		border: 1px solid var(--c-border);
	}

	.emoji-sidebar {
		width: 100%;
		flex-shrink: 0;
		height: 40vh;
		overflow: hidden;
		margin-top: var(--sp-2);
	}
</style>
