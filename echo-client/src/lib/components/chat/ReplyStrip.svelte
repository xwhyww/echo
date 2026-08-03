<script lang="ts">
	import type { ReplyToSnapshot } from '$lib/api/personalChats.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	interface Props {
		snapshot: ReplyToSnapshot;
		/** False when the quoted message is no longer reachable — no jump, no hover. */
		clickable?: boolean;
		onjump?: () => void;
	}

	let { snapshot, clickable = false, onjump }: Props = $props();

	const snippet = $derived.by(() => {
		if (snapshot.content) return snapshot.content;
		if (snapshot.attachmentType?.startsWith('image/')) return i18n.t.chat.kinds.photo;
		if (snapshot.attachmentType?.startsWith('video/')) return i18n.t.chat.kinds.video;
		if (snapshot.attachmentType) return i18n.t.chat.kinds.file;
		return i18n.t.chat.kinds.message;
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="reply-strip" class:clickable onclick={() => onjump?.()}>
	<span class="reply-author body-xs fw-semibold lh-tight text-accent">{snapshot.authorName}</span>
	<span class="reply-snippet body-xs text-default">{snippet}</span>
</div>

<style>
	.reply-strip {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: var(--sp-1) var(--sp-2) var(--sp-1) var(--sp-3);
		margin-bottom: var(--sp-2);
		border-left: 2px solid var(--c-accent-solid);
		border-radius: var(--radius-sm);
		/* Neutral shade, not its own hue — it has to sit on both the grey
		   incoming bubble and the terracotta own bubble without muddying. */
		background: var(--c-bubble-inset);
		overflow: hidden;
	}

	.reply-strip.clickable {
		cursor: pointer;
	}

	.reply-strip.clickable:hover {
		background: var(--c-bubble-inset-hover);
	}

	.reply-snippet {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
