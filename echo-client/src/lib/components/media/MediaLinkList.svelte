<script lang="ts">
	import { ExternalLink } from 'lucide-svelte';
	import type { MediaGalleryLink } from '$lib/utils/mediaGallery.js';

	// The links tab: every URL that has been posted, newest first, each opening
	// in the browser rather than in the app.
	interface Props {
		items: MediaGalleryLink[];
	}

	let { items }: Props = $props();
</script>

<div class="link-list">
	{#each items as item (item.messageId + item.url)}
		<a href={item.url} class="link-row text-default" target="_blank" rel="noopener noreferrer">
			<ExternalLink size={18} />
			<span class="link-info">
				<span class="link-url body-sm text-accent">{item.url}</span>
				<span class="body-xs text-muted">{new Date(item.createdAt).toLocaleDateString()}</span>
			</span>
		</a>
	{/each}
</div>

<style lang="scss">
	@use '$lib/styles/layout.mixin' as *;

	.link-list {
		display: flex;
		flex-direction: column;
	}

	.link-row {
		@include media-row;
	}

	.link-info {
		@include media-row-text;
	}

	.link-url {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
