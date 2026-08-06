<script lang="ts">
	import { X, Reply } from 'lucide-svelte';
	import type { ReplyToSnapshot } from '$lib/api/personalChats.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		snapshot: ReplyToSnapshot;
		oncancel: () => void;
	}

	let { snapshot, oncancel }: Props = $props();

	function snippetLabel(s: ReplyToSnapshot): string {
		if (s.content) return s.content;
		if (s.attachmentType?.startsWith('image/')) return i18n.t.chat.kinds.photo;
		if (s.attachmentType?.startsWith('video/')) return i18n.t.chat.kinds.video;
		if (s.attachmentType) return i18n.t.chat.kinds.file;
		return i18n.t.chat.kinds.message;
	}
</script>

<div class="reply-preview">
	<Reply size={16} class="reply-icon" />
	<div class="reply-preview-body">
		<span class="reply-preview-author body-xs fw-semibold lh-tight text-accent">{snapshot.authorName}</span>
		<span class="reply-preview-text body-xs text-muted">{snippetLabel(snapshot)}</span>
	</div>
	<button class="reply-preview-close text-muted" onclick={oncancel} aria-label={t.chat.cancelReply}>
		<X size={16} />
	</button>
</div>

<style>
	.reply-preview {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		background: var(--c-bg-3);
		border-left: 2px solid var(--c-accent-solid);
		border-radius: var(--radius-sm);
		margin-bottom: var(--sp-2);
	}

	.reply-preview-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.reply-preview-text {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.reply-preview-close {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		background: none;
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: color var(--duration-fast) var(--ease-default);
	}

	:global(.reply-icon) {
		flex-shrink: 0;
		color: var(--c-accent-text);
	}
</style>
