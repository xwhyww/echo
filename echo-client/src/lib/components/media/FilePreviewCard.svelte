<script lang="ts">
	import { X } from 'lucide-svelte';
	import FileAttachment from '$lib/components/media/FileAttachment.svelte';
	import { resolveUrl, blobCrossOrigin } from '$lib/api/client';
	import { itemMime, itemName, itemSize, type PreviewItem } from '$lib/utils/filePreview.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		item: PreviewItem;
		/** Documents lay out left-to-right and take the full row. */
		horizontal?: boolean;
		onremove: () => void;
	}

	let { item, horizontal = false, onremove }: Props = $props();

	const mime = $derived(itemMime(item));
	const name = $derived(itemName(item));
	const isMedia = $derived(mime.startsWith('image/') || mime.startsWith('video/'));

	// A picked file has no URL of its own, so it gets a blob one for as long as
	// the card lives — created here rather than in the markup, where every
	// re-render would mint another and leak it.
	let objectUrl = $state<string | null>(null);

	$effect(() => {
		if (item.kind !== 'file') return;
		const url = URL.createObjectURL(item.file);
		objectUrl = url;
		return () => URL.revokeObjectURL(url);
	});

	const src = $derived(item.kind === 'file' ? objectUrl : resolveUrl(item.attachment.url));
	const crossorigin = $derived(item.kind === 'file' ? undefined : blobCrossOrigin);
</script>

<div class="file-card" class:media={isMedia}>
	{#if mime.startsWith('image/')}
		<div class="preview-image">
			{#if src}<img {src} {crossorigin} alt={name} />{/if}
		</div>
	{:else if mime.startsWith('video/')}
		<div class="preview-image">
			<!-- svelte-ignore a11y_media_has_caption -->
			{#if src}<video {src} {crossorigin} preload="metadata" muted></video>{/if}
		</div>
	{:else}
		<FileAttachment {horizontal} filename={name} size={itemSize(item)} />
	{/if}
	<button class="remove-btn" onclick={onremove} aria-label={t.chat.removeItem(name)}>
		<X size={14} />
	</button>
</div>

<style>
	.file-card {
		position: relative;
		display: flex;
		flex-direction: column;
		width: 100%;
		overflow: hidden;
	}

	/* Three thumbnails to a row, the way they will tile in the bubble. The gap
	   comes from the row so the two stay in step; a lone image keeps the same
	   third of the width rather than stretching. */
	.file-card.media {
		flex: 0 0 calc((100% - var(--preview-row-gap, 2px) * 2) / 3);
		width: calc((100% - var(--preview-row-gap, 2px) * 2) / 3);
	}

	.remove-btn {
		position: absolute;
		top: var(--sp-1);
		right: var(--sp-1);
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: none;
		background: rgba(0, 0, 0, 0.6);
		color: white;
		cursor: pointer;
		padding: 0;
		transition: background var(--duration-fast) var(--ease-default);
	}

	.remove-btn:hover {
		background: rgba(0, 0, 0, 0.8);
	}

	.preview-image {
		width: 100%;
		aspect-ratio: 1;
		overflow: hidden;
	}

	.preview-image img,
	.preview-image video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
</style>
