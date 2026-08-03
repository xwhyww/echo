<script lang="ts">
	import { Play } from 'lucide-svelte';
	import { resolveUrl, blobCrossOrigin } from '$lib/api/client.js';

	// One image or video shown as a cover-fitted preview, with the badge that
	// marks a video. The frame around it — tile, strip item, whatever — belongs
	// to whoever places it; this is only the picture and the marker.
	interface Props {
		url: string;
		/** 200px preview when the server made one; falls back to the original. */
		thumbUrl?: string | null;
		filename: string;
		mimeType: string;
		/** How the video marker reads: a wash over the whole tile, or a badge. */
		badge?: 'scrim' | 'circle';
		/** For grids, where most tiles start off-screen. */
		lazy?: boolean;
	}

	let { url, thumbUrl, filename, mimeType, badge = 'circle', lazy = false }: Props = $props();

	const isVideo = $derived(mimeType.startsWith('video/'));
</script>

{#if isVideo}
	<!-- svelte-ignore a11y_media_has_caption -->
	<video
		src={resolveUrl(url)}
		crossorigin={blobCrossOrigin}
		class="thumb-media"
		preload="metadata"
		muted
	></video>
	<span class="play-badge {badge}" aria-hidden="true">
		<Play size={badge === 'scrim' ? 24 : 16} fill="white" />
	</span>
{:else}
	<img
		src={resolveUrl(thumbUrl ?? url)}
		crossorigin={blobCrossOrigin}
		alt={filename}
		class="thumb-media"
		loading={lazy ? 'lazy' : 'eager'}
	/>
{/if}

<style>
	.thumb-media {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.play-badge {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	/* Over a tile big enough to carry it, the whole picture dims. */
	.play-badge.scrim {
		inset: 0;
		background: rgba(0, 0, 0, 0.25);
	}

	/* On something thumbnail-sized, a wash would just look like a dark image. */
	.play-badge.circle {
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.55);
	}
</style>
