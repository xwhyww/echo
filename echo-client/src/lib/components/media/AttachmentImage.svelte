<script lang="ts">
	import { resolveUrl, blobCrossOrigin } from '$lib/api/client';
	import type { Attachment } from '$lib/api/personalChats.js';

	interface Props {
		attachment: Attachment;
		onopen?: () => void;
	}

	let { attachment, onopen }: Props = $props();

	let loaded = $state(false);

	// Fires the loaded callback even when the image is already in the browser
	// cache (in which case `load` may have fired before Svelte attached the
	// listener).
	function imgLoaded(node: HTMLImageElement, callback: () => void) {
		if (node.complete && node.naturalWidth > 0) {
			callback();
		} else {
			node.addEventListener('load', callback, { once: true });
		}
		return {
			destroy() {
				node.removeEventListener('load', callback);
			}
		};
	}
</script>

<div class="image-skeleton" class:skeleton-hidden={loaded}></div>
<button type="button" class="media-trigger" onclick={() => onopen?.()} aria-label={attachment.filename}>
	<img
		use:imgLoaded={() => (loaded = true)}
		src={resolveUrl(attachment.thumbUrl ?? attachment.url)}
		crossorigin={blobCrossOrigin}
		alt={attachment.filename}
		class="attachment-img"
		class:media-loaded={loaded}
	/>
</button>

<style>
	.media-trigger {
		display: block;
		width: 100%;
		height: 100%;
		padding: 0;
		border: none;
		cursor: pointer;
		color: inherit;
		background: var(--grad-media-backdrop);
	}

	.attachment-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.3s ease;
		display: block;
	}

	.attachment-img.media-loaded {
		opacity: 1;
	}

	.image-skeleton {
		position: absolute;
		inset: 0;
		background: var(--c-bg-3);
		overflow: hidden;
		z-index: 1;
		opacity: 1;
		transition: opacity 0.3s ease;
	}

	.image-skeleton.skeleton-hidden {
		opacity: 0;
		pointer-events: none;
	}

	.image-skeleton::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			90deg,
			transparent 0%,
			rgba(255, 255, 255, 0.04) 50%,
			transparent 100%
		);
		animation: shimmer 1.5s infinite;
	}

	@keyframes shimmer {
		0% { transform: translateX(-100%); }
		100% { transform: translateX(100%); }
	}
</style>
