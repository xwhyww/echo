<script lang="ts">
	import { auth } from '$lib/stores/auth.svelte.js';
	import JumpToReactionButton from '$lib/components/chat/JumpToReactionButton.svelte';
	import MessageList from '$lib/components/chat/MessageList.svelte';
	import MessageSearchResults from '$lib/components/chat/MessageSearchResults.svelte';
	import PendingMessage from '$lib/components/chat/PendingMessage.svelte';
	import PersonalChatBubble from '$lib/components/chat/PersonalChatBubble.svelte';
	import PersonalChatComposer from '$lib/components/chat/PersonalChatComposer.svelte';
	import PersonalChatHeader from '$lib/components/chat/PersonalChatHeader.svelte';
	import PersonalChatModals from '$lib/components/chat/PersonalChatModals.svelte';
	import { usePerschatPage } from '$lib/hooks/chat/usePerschatPage.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	const perschat = usePerschatPage();
	const chat = $derived(perschat.chat);
</script>

<!-- Not a PageColumn: a conversation fills the viewport and scrolls its own
     message list rather than stacking sections down a column. -->
<div class="chat-layout">
	<div class="chat-page">
		<PersonalChatHeader
			companion={perschat.companion}
			isSelf={chat.isSelf}
			title={chat.chatWith}
			typingUsers={chat.typingUsers}
			onopeninfo={perschat.openInfo}
		/>

		{#if perschat.search.showingPanel}
			<MessageSearchResults
				results={perschat.search.results}
				loading={perschat.search.loading}
				error={perschat.search.error}
				onjump={(id) => perschat.actions.jumpToSearchResult(id, perschat.search.jumped)}
			/>
		{/if}

		<MessageList
			items={chat.messages}
			loading={chat.loading}
			loadingOlder={chat.loadingOlder}
			loadingNewer={chat.loadingNewer}
			bind:container={chat.messagesContainer}
			hidden={perschat.search.showingPanel}
			pinnedToBottom={chat.pinnedToBottom}
			unread={chat.newMessagesBelow}
			selection={perschat.selection}
			onscroll={chat.handleScroll}
			onjumptobottom={() => chat.jumpToBottom()}
		>
			{#snippet row(msg, i)}
				{#if msg.id === chat.firstUnreadMessageId}
					<div class="unread-separator">
						<span class="body-xs">{t.chat.unreadMessages}</span>
					</div>
				{/if}
				<PersonalChatBubble
					message={msg}
					next={chat.messages[i + 1]}
					companion={perschat.companion}
					{chat}
					actions={perschat.actions}
					selection={perschat.selection}
					mentions={perschat.mentions}
				/>
			{/snippet}

			{#snippet footer()}
				{#each chat.uploadTasks as task (task.id)}
					<PendingMessage
						files={task.files}
						text={task.text}
						progress={task.progress}
						processing={task.status === 'processing'}
						failed={task.status === 'failed'}
						authorName={auth.user?.displayName ?? auth.user?.username ?? ''}
						avatarUrl={auth.user?.avatarUrl}
						oncancel={() => chat.cancelUpload(task.id)}
						onretry={() => chat.retryUpload(task.id)}
						onremove={() => chat.removeFailedUpload(task.id)}
					/>
				{/each}
			{/snippet}

			{#snippet overlay()}
				{#if perschat.unseenReaction}
					<JumpToReactionButton
						emoji={perschat.unseenReaction.emoji}
						stacked={!chat.pinnedToBottom}
						onclick={() => chat.jumpToMessage(perschat.unseenReaction!.messageId)}
					/>
				{/if}
			{/snippet}
		</MessageList>

		<PersonalChatComposer
			{chat}
			actions={perschat.actions}
			selection={perschat.selection}
			canMessage={perschat.canMessage}
			resetKey={perschat.companionId}
		/>
	</div>
</div>

<PersonalChatModals actions={perschat.actions} mentions={perschat.mentions} />

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
		/* Containing block for the overlaid header and composer. Without it they
		   anchor to the viewport and overhang the emoji sidebar. */
		position: relative;
		background-image: linear-gradient(rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.8)),
			url('/chat-bg/chat-bg-1.jpg');
		background-size: cover, 200%;
		background-position: center, center;
		background-repeat: no-repeat, repeat;
	}

	.unread-separator {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-1) 0;
	}

	.unread-separator::before,
	.unread-separator::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--c-accent);
		opacity: 0.5;
	}

	.unread-separator span {
		color: var(--c-accent-text);
		white-space: nowrap;
	}

	/* Set by the jump-to-message helpers on whichever bubble they land on. */
	:global(.bubble.highlight-flash),
	:global(.bubble-row.highlight-flash) {
		animation: highlight-flash 1.6s var(--ease-default);
	}

	@keyframes highlight-flash {
		0%, 100% { background: transparent; }
		20% { background: color-mix(in srgb, var(--c-accent) 20%, transparent); }
	}
</style>
