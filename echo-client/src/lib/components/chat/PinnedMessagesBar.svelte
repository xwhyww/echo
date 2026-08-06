<script lang="ts">
	import { Pin, X, ChevronDown, Paperclip } from 'lucide-svelte';
	import type { PersonalMessage } from '$lib/api/personalChats.js';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		pinned: PersonalMessage[];
		onjump: (messageId: string) => void;
		onunpin?: (messageId: string) => void;
	}

	let { pinned, onjump, onunpin }: Props = $props();

	let listOpen = $state(false);

	const latest = $derived(pinned[0] ?? null);

	function formatDate(iso: string): string {
		const d = new Date(iso);
		const now = new Date();
		const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		if (d.toDateString() === now.toDateString()) return time;
		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);
		if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
		return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
	}

	// `clip` marks a generic-document preview, which the markup prefixes with a
	// Paperclip glyph.
	function preview(msg: PersonalMessage): { text: string; clip: boolean } {
		if (msg.content?.trim()) return { text: msg.content, clip: false };
		if (msg.attachments?.length) {
			const first = msg.attachments[0];
			if (first.mimeType.startsWith('image/')) return { text: i18n.t.chat.kinds.photo, clip: false };
			if (first.mimeType.startsWith('video/')) return { text: i18n.t.chat.kinds.video, clip: false };
			if (first.mimeType.startsWith('audio/')) return { text: i18n.t.chat.kinds.audio, clip: false };
			return { text: first.filename, clip: true };
		}
		return { text: '', clip: false };
	}

	function handleBarClick() {
		if (pinned.length > 1) {
			listOpen = !listOpen;
		} else if (latest) {
			onjump(latest.id);
		}
	}

	function handleItemClick(messageId: string) {
		listOpen = false;
		onjump(messageId);
	}

	function handleUnpin(e: MouseEvent, messageId: string) {
		e.stopPropagation();
		onunpin?.(messageId);
	}
</script>

{#if latest}
	{@const latestPreview = preview(latest)}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="pinned-bar" onclick={handleBarClick}>
		<div class="pin-icon text-accent">
			<Pin size={16} />
		</div>
		<div class="pinned-content">
			<div class="pinned-label body-xs fw-semibold text-accent">
				{t.chat.pinnedHeader(pinned.length)}
			</div>
			<div class="pinned-preview body-xs text-default">
				{#if latestPreview.clip}<span class="clip text-muted"><Paperclip size={14} /></span>{/if}{latestPreview.text}
			</div>
		</div>
		{#if pinned.length > 1}
			<div class="chevron text-muted" class:open={listOpen}>
				<ChevronDown size={18} />
			</div>
		{/if}
	</div>

	{#if listOpen && pinned.length > 1}
		<Modal title={t.chat.pinnedMessages} onclose={() => listOpen = false}>
			<div class="pinned-list-items">
				{#each pinned as msg (msg.id)}
					{@const itemPreview = preview(msg)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="pinned-item" onclick={() => handleItemClick(msg.id)}>
						<div class="pinned-item-content">
							<div class="pinned-item-header">
								<span class="pinned-item-author body-xs fw-semibold text-accent">{msg.author.displayName ?? msg.author.username}</span>
								<span class="pinned-item-date body-xs text-muted">{formatDate(msg.createdAt)}</span>
							</div>
							<div class="pinned-item-preview body-sm text-default">
								{#if itemPreview.clip}<span class="clip text-muted"><Paperclip size={14} /></span>{/if}{itemPreview.text}
							</div>
						</div>
						{#if onunpin}
							<button class="pinned-item-unpin text-muted" onclick={(e) => handleUnpin(e, msg.id)} aria-label={t.chat.unpin}>
								<X size={16} />
							</button>
						{/if}
					</div>
				{/each}
			</div>
		</Modal>
	{/if}
{/if}

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.pinned-bar {
		flex-shrink: 0;
		position: relative;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-1) var(--sp-3);

		border-radius: 32px;
		background: var(--c-bg-2);
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);

		/* Placement is the bar stack's job — see AppBars.svelte. */
		width: 100%;

		@include glass;
	}

	.pin-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.pinned-content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.pinned-preview {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: flex;
		align-items: center;
	}

	.clip {
		display: inline-flex;
		flex-shrink: 0;
		margin-right: 4px;
		vertical-align: middle;
	}

	.chevron {
		transition: transform var(--duration-fast) var(--ease-default);
		flex-shrink: 0;
	}

	.chevron.open {
		transform: rotate(180deg);
	}

	/* The modal owns the card; this is just the scrolling list inside it. */
	.pinned-list-items {
		max-height: 60vh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.pinned-item {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) 0;
		border-radius: var(--radius-md, 6px);
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);
	}

	.pinned-item-content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.pinned-item-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
	}

	.pinned-item-date {
		white-space: nowrap;
	}

	.pinned-item-preview {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.pinned-item-unpin {
		background: transparent;
		border: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--sp-1);
		border-radius: var(--radius-sm, 4px);
		flex-shrink: 0;
	}
</style>
