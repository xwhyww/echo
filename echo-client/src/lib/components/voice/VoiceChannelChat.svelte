<script lang="ts">
	import { X } from 'lucide-svelte';
	import { voiceChatService } from '$lib/api/voiceChatService.js';
	import { voiceChannelChatCaches } from '$lib/hooks/voice/useVoiceChannelChatCache.svelte.js';
	import { useGroupMemberIndex } from '$lib/hooks/groups/useGroupMemberIndex.svelte.js';
	import { auth } from '$lib/stores/auth.svelte.js';
	import { type WsEvent } from '$lib/stores/ws.svelte.js';
	import type { ChatPanelEvent } from '$lib/chat/types.js';
	import type { VoiceChannelMessage } from '$lib/api/voiceChat.js';
	import ChatPanel from '$lib/components/chat/ChatPanel.svelte';
	import EmojiPicker from '$lib/components/emoji/EmojiPicker.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		groupId: string;
		channelId: string;
		channelName?: string | null;
		onClose?: () => void;
	}

	const { groupId, channelId, channelName = null, onClose }: Props = $props();

	let messagesByChannel = $state(new Map<string, VoiceChannelMessage[]>());
	let emojiOpen = $state(false);
	let insertAtCursor = $state<((emoji: string) => void) | null>(null);

	const roster = useGroupMemberIndex(() => groupId);

	function trackMessage(msg: VoiceChannelMessage) {
		const list = messagesByChannel.get(channelId) ?? [];
		list.push(msg);
		messagesByChannel.set(channelId, list);
	}

	// The voice service inlines author info on every message row, so authors
	// accumulate as messages stream in — which covers reactors who aren't (or
	// aren't yet) in the group members list.
	const authorIndex = $derived.by(() => {
		const m = new Map<string, { name: string; avatarUrl: string | null }>();
		const list = messagesByChannel.get(channelId) ?? [];
		for (const msg of list) {
			m.set(msg.author.id, {
				name: msg.author.displayName ?? msg.author.username,
				avatarUrl: msg.author.avatarUrl ?? null,
			});
		}
		return m;
	});

	function reactorLookup(userId: string): { name: string; avatarUrl: string | null } | null {
		const member = roster.find(userId);
		if (member) return member;
		const a = authorIndex.get(userId);
		if (a) return a;
		const me = auth.user;
		if (me && me.id === userId) {
			return { name: me.displayName ?? me.username, avatarUrl: me.avatarUrl ?? null };
		}
		return null;
	}

	function matchEvent(e: WsEvent): ChatPanelEvent | null {
		switch (e.type) {
			case 'voice_channel_message':
				if (e.channelId !== channelId) return null;
				return { kind: 'message', message: e.message };
			case 'voice_channel_message_edited':
				if (e.channelId !== channelId) return null;
				return {
					kind: 'edited',
					messageId: e.messageId,
					content: e.content,
					attachments: e.attachments,
					updatedAt: e.updatedAt,
				};
			case 'voice_channel_message_deleted':
				if (e.channelId !== channelId) return null;
				return { kind: 'deleted', messageId: e.messageId };
			case 'voice_channel_message_pinned':
				if (e.channelId !== channelId) return null;
				return {
					kind: 'pinned',
					messageId: e.messageId,
					pinnedAt: e.pinnedAt,
					pinnedBy: e.pinnedBy,
				};
			case 'voice_channel_message_unpinned':
				if (e.channelId !== channelId) return null;
				return { kind: 'unpinned', messageId: e.messageId };
			case 'voice_channel_message_reaction':
				if (e.channelId !== channelId) return null;
				return { kind: 'reaction', messageId: e.messageId, reactions: e.reactions };
			default:
				return null;
		}
	}
</script>

<div class="vc-chat-wrap">
	<aside class="vc-chat" aria-label={t.voice.channelChat.aria}>
		<div class="vc-chat-header">
			<h3 class="vc-chat-title body-base fw-semibold text-default">{t.voice.channelChat.title}</h3>
			{#if channelName}
				<span class="vc-chat-sub body-xs text-faint">#{channelName}</span>
			{/if}
			{#if onClose}
				<button
					type="button"
					class="vc-chat-close text-muted"
					onclick={onClose}
					aria-label={t.voice.channelChat.closeAria}
					title={t.voice.channelChat.close}
				>
					<X size={18} />
				</button>
			{/if}
		</div>

		{#key channelId}
			<ChatPanel
				id={channelId}
				uploadId={groupId}
				service={voiceChatService}
				cache={voiceChannelChatCaches}
				{matchEvent}
				{reactorLookup}
				inputPlaceholder={channelName
					? t.voice.channelChat.channelPlaceholder(channelName)
					: t.chat.messagePlaceholder}
				onMessageReceived={(msg) => trackMessage(msg as VoiceChannelMessage)}
				bind:emojiOpen
				bind:insertAtCursor
			/>
		{/key}

		{#if emojiOpen}
			<div class="emoji-sidebar">
				<EmojiPicker onselect={(emoji) => insertAtCursor?.(emoji)} />
			</div>
		{/if}
	</aside>
</div>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.vc-chat-wrap {
		display: flex;
		flex-direction: row;
		flex: 1;
		min-width: 0;
		height: 100%;
	}

	.vc-chat {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 320px;
		height: 100%;
		position: relative;
		padding-top: var(--safe-top);
		padding-bottom: var(--safe-bottom);
	}

	.vc-chat-header {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-3) var(--sp-4) var(--sp-3) var(--sp-6);
		border-bottom: 1px solid var(--c-border);
		margin: 0 var(--sp-2) 0;
		border-radius: var(--radius-full);

		@include glass;
	}

	.vc-chat-title {
		margin: 0;
	}

	.vc-chat-close {
		margin-left: auto;
		width: 24px;
		height: 24px;
		border-radius: var(--radius-sm);
		border: none;
		background: transparent;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-default),
			color var(--duration-fast) var(--ease-default);
	}

	.vc-chat-close:hover {
		background: var(--c-bg-2);
		color: var(--c-text);
	}

	/* Voice chat lives inside a side panel with no spare horizontal room, so
	   the emoji picker overlays the messages area instead of slotting in as a
	   sibling like it does on the group page. */
	.emoji-sidebar {
		position: absolute;
		top: var(--header-h);
		right: 0;
		bottom: 0;
		width: 352px;
		max-width: 100%;
		border-left: 1px solid var(--c-border);
		background: var(--c-bg-1);
		overflow: hidden;
		z-index: 20;
	}
</style>
