<script lang="ts" generics="T extends { id: string }">
	import type { Snippet } from 'svelte';
	import ScrollToBottomButton from '$lib/components/chat/ScrollToBottomButton.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// The scaffolding every conversation shares: the scroller, its loading and
	// empty states, the paging indicators at each end, and the button back to
	// the newest message. What a message *looks* like differs per surface —
	// personal chats show read receipts and replies, groups show system events —
	// so each row is rendered by the caller's `row` snippet.
	interface Props {
		items: T[];
		loading: boolean;
		/** Paging in progress at either end of the list. */
		loadingOlder?: boolean;
		loadingNewer?: boolean;
		/** The scroller element, for the caller's scroll maths. */
		container?: HTMLElement | null;
		/** Hidden rather than unmounted, so its scroll position survives. */
		hidden?: boolean;
		pinnedToBottom: boolean;
		/** Badges the jump button; leave at 0 for surfaces that don't count. */
		unread?: number;
		/** Where the jump button sits — raise it on surfaces with a floating composer. */
		jumpButtonBottom?: string;
		/** Drag-to-select, when the surface supports it. */
		selection?: {
			dragSelecting: boolean;
			onDragStart: (e: MouseEvent) => void;
			onDragMove: (e: MouseEvent) => void;
			onDragEnd: () => void;
		};
		onscroll?: (e: Event) => void;
		onjumptobottom: () => void;
		row: Snippet<[T, number]>;
		/** Rendered after the last row — pending uploads, mostly. */
		footer?: Snippet;
		/** Rendered over the scroller: typing indicators, floating buttons. */
		overlay?: Snippet;
	}

	let {
		items,
		loading,
		loadingOlder = false,
		loadingNewer = false,
		container = $bindable(null),
		hidden = false,
		pinnedToBottom,
		unread = 0,
		jumpButtonBottom = 'calc(var(--safe-bottom) + 68px)',
		selection,
		onscroll,
		onjumptobottom,
		row,
		footer,
		overlay,
	}: Props = $props();
</script>

<div class="chat-messages-wrapper" class:hidden>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="chat-messages"
		class:drag-selecting={selection?.dragSelecting}
		bind:this={container}
		{onscroll}
		onmousedown={selection?.onDragStart}
		onmousemove={selection?.onDragMove}
		onmouseup={selection?.onDragEnd}
		onmouseleave={selection?.onDragEnd}
	>
		{#if loading}
			<p class="body-sm text-faint">{t.common.loading}</p>
		{:else if items.length === 0}
			<p class="body-sm text-faint">{t.chat.noMessages}</p>
		{:else}
			<div class="messages-list">
				{#if loadingOlder}
					<p class="body-xs text-faint loading-indicator">{t.common.loading}</p>
				{/if}
				{#each items as item, i (item.id)}
					{@render row(item, i)}
				{/each}
				{#if loadingNewer}
					<p class="body-xs text-faint loading-indicator">{t.common.loading}</p>
				{/if}
				{@render footer?.()}
			</div>
		{/if}
	</div>

	{@render overlay?.()}

	{#if !pinnedToBottom}
		<ScrollToBottomButton {unread} bottom={jumpButtonBottom} onclick={onjumptobottom} />
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/chat-layout.mixin' as *;

	.chat-messages-wrapper {
		@include chat-messages-wrapper;
	}

	.chat-messages-wrapper.hidden {
		display: none;
	}

	.chat-messages {
		@include chat-messages-scroller;
		@include chat-messages-drag-select;
		padding-bottom: calc(var(--safe-bottom) + 44px);
	}

	.messages-list {
		@include chat-messages-list;
	}

	.loading-indicator {
		align-self: center;
		padding: var(--sp-2);
	}
</style>
