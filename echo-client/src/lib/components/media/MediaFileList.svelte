<script lang="ts">
	import { FileText, Download } from 'lucide-svelte';
	import { resolveUrl } from '$lib/api/client.js';
	import { formatSize } from '$lib/utils.js';
	import { galleryItemKey, type MediaGalleryItem } from '$lib/utils/mediaGallery.js';

	// The files tab: every non-media attachment, each row a download.
	interface Props {
		items: MediaGalleryItem[];
	}

	let { items }: Props = $props();
</script>

<div class="file-list">
	{#each items as item (galleryItemKey(item))}
		<a
			href={resolveUrl(item.attachment.url)}
			class="file-row"
			download={item.attachment.filename}
			target="_blank"
		>
			<FileText size={20} />
			<span class="file-info">
				<span class="file-name body-sm">{item.attachment.filename}</span>
				<span class="body-xs">{formatSize(item.attachment.size)}</span>
			</span>
			<Download size={18} />
		</a>
	{/each}
</div>

<style lang="scss">
	@use '$lib/styles/layout.mixin' as *;

	.file-list {
		display: flex;
		flex-direction: column;
	}

	.file-row {
		@include media-row;
	}

	.file-info {
		@include media-row-text;
	}

	.file-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
