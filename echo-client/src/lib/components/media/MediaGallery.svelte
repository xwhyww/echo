<script lang="ts">
	import AudioAttachment from '$lib/components/audio/AudioAttachment.svelte';
	import LoadMore from '$lib/components/ui/LoadMore.svelte';
	import LoadState from '$lib/components/ui/LoadState.svelte';
	import MediaFileList from '$lib/components/media/MediaFileList.svelte';
	import MediaGrid from '$lib/components/media/MediaGrid.svelte';
	import MediaLinkList from '$lib/components/media/MediaLinkList.svelte';
	import MediaViewer from '$lib/components/media/MediaViewer.svelte';
	import {
		galleryItemKey,
		MEDIA_KINDS,
		type GalleryAttachment,
		type MediaGalleryItem,
		type MediaGalleryLink,
		type MediaKind,
	} from '$lib/utils/mediaGallery.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// Presentational shell for the chat/group "media" pages. The parent owns data
	// loading (which differs per surface) and passes the loaded pages in; the
	// gallery picks the layout for the open tab, asks for the next page when the
	// foot of the list comes into view, and hosts the fullscreen viewer.
	let {
		kind,
		items,
		linkItems,
		initialLoading,
		loading,
		hasMore,
		error,
		onsetkind,
		onloadmore,
	}: {
		kind: MediaKind;
		items: MediaGalleryItem[];
		linkItems: MediaGalleryLink[];
		initialLoading: boolean;
		loading: boolean;
		hasMore: boolean;
		error: string | null;
		onsetkind: (kind: MediaKind) => void;
		onloadmore: () => void;
	} = $props();

	let viewer = $state<{ attachments: GalleryAttachment[]; index: number } | null>(null);

	const isEmpty = $derived((kind === 'links' ? linkItems.length : items.length) === 0);

	function openViewer(index: number) {
		viewer = { attachments: items.map((it) => it.attachment), index };
	}
</script>

<div class="tabs">
	{#each MEDIA_KINDS as k}
		<button
			class="tab body-sm {kind === k ? 'text-accent' : 'text-muted'}"
			class:active={kind === k}
			onclick={() => onsetkind(k)}
		>
			{t.media.titles[k]}
		</button>
	{/each}
</div>

<div class="media-scroll">
	<LoadState
		loading={initialLoading}
		{error}
		empty={isEmpty ? t.media.empty[kind] : null}
	>
		{#if kind === 'links'}
			<MediaLinkList items={linkItems} />
		{:else if kind === 'audio'}
			<div class="audio-list">
				{#each items as item (galleryItemKey(item))}
					<AudioAttachment
						id={item.attachment.id}
						url={item.attachment.url}
						filename={item.attachment.filename}
						size={item.attachment.size}
					/>
				{/each}
			</div>
		{:else if kind === 'files'}
			<MediaFileList {items} />
		{:else}
			<MediaGrid {items} onopen={openViewer} />
		{/if}

		{#if hasMore}
			<LoadMore {loading} onload={onloadmore} rootMargin="400px" />
		{:else}
			<p class="body-xs text-faint end">{t.common.end}</p>
		{/if}
	</LoadState>
</div>

{#if viewer}
	<MediaViewer
		attachments={viewer.attachments as never}
		startIndex={viewer.index}
		onclose={() => (viewer = null)}
	/>
{/if}

<style>
	.tabs {
		display: flex;
		gap: var(--sp-1);
		border-bottom: 1px solid var(--c-border);
	}

	.tab {
		padding: var(--sp-2) var(--sp-3);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition:
			color var(--duration-fast) var(--ease-default),
			border-color var(--duration-fast) var(--ease-default);
	}

	/* `--c-accent` is a gradient in the dark theme, so as a `color` or a
	   `border-*-color` it is invalid and silently drops out — the active tab used
	   to lose its tint there. `--c-accent-text` is the flat one. */
	.tab.active {
		border-bottom-color: var(--c-accent-text);
	}

	.media-scroll {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.audio-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding: var(--sp-2) 0;
		/* Let the rows use the gallery's full width instead of a bubble's. */
		--audio-max-w: 100%;
	}

	.end {
		text-align: center;
		padding: var(--sp-3);
	}
</style>
