<script lang="ts">
	import MediaThumb from '$lib/components/media/MediaThumb.svelte';
	import { galleryItemKey, type MediaGalleryItem } from '$lib/utils/mediaGallery.js';

	// The photo / video / gif tab: square tiles that open the fullscreen viewer.
	interface Props {
		items: MediaGalleryItem[];
		/** Index into `items` — the viewer pages through the whole tab. */
		onopen: (index: number) => void;
	}

	let { items, onopen }: Props = $props();
</script>

<div class="media-grid">
	{#each items as item, idx (galleryItemKey(item))}
		<button class="media-cell" onclick={() => onopen(idx)} aria-label={item.attachment.filename}>
			<MediaThumb
				url={item.attachment.url}
				thumbUrl={item.attachment.thumbUrl}
				filename={item.attachment.filename}
				mimeType={item.attachment.mimeType}
				badge="scrim"
				lazy
			/>
		</button>
	{/each}
</div>

<style>
	.media-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 4px;
	}

	.media-cell {
		position: relative;
		aspect-ratio: 1;
		padding: 0;
		border: none;
		background: var(--c-bg-3);
		cursor: pointer;
		overflow: hidden;
		border-radius: var(--radius-sm);
	}
</style>
