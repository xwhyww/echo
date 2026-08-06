<script lang="ts">
	import { tick } from 'svelte';
	import ChatBubble from '$lib/components/chat/ChatBubble.svelte';
	import { auth } from '$lib/stores/auth.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { Attachment } from '$lib/api/personalChats.js';

	const t = $derived(i18n.t);

	interface Hit {
		id: string;
		content: string;
		attachments: Attachment[];
		authorId: string;
		author: { displayName: string | null; username: string; avatarUrl: string | null };
		createdAt: string;
	}

	// Search hits shown in place of the message list, oldest first like the real
	// thing — so it opens at the bottom, nearest the most recent match.
	interface Props {
		results: Hit[];
		loading: boolean;
		error: string | null;
		onjump: (messageId: string) => void;
	}

	let { results, loading, error, onjump }: Props = $props();

	let scroller = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (results.length === 0) return;
		const el = scroller;
		tick().then(() => el?.scrollTo({ top: el.scrollHeight }));
	});
</script>

<div class="chat-messages-wrapper">
	<div class="chat-messages" bind:this={scroller}>
		{#if error}
			<p class="body-sm text-faint">{error}</p>
		{:else if loading && results.length === 0}
			<p class="body-sm text-faint">{t.common.searching}</p>
		{:else if results.length === 0}
			<p class="body-sm text-faint">{t.chat.noMatches}</p>
		{:else}
			<div class="messages-list">
				{#each results as hit (hit.id)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="search-bubble" onclick={() => onjump(hit.id)}>
						<ChatBubble
							id={hit.id}
							content={hit.content}
							attachments={hit.attachments}
							authorName={hit.author.displayName ?? hit.author.username}
							avatarUrl={hit.author.avatarUrl}
							time={hit.createdAt}
							own={hit.authorId === auth.user?.id}
						/>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/chat-layout.mixin' as *;

	.chat-messages-wrapper { @include chat-messages-wrapper; }
	.chat-messages { @include chat-messages-scroller; }
	.messages-list { @include chat-messages-list; }

	.search-bubble {
		cursor: pointer;
		border-radius: var(--radius-md);
		padding: var(--sp-2);
		transition: background var(--duration-fast) var(--ease-default);
	}
</style>
