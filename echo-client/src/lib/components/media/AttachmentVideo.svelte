<script lang="ts">
	import { Play } from 'lucide-svelte';
	import { resolveUrl, blobCrossOrigin } from '$lib/api/client';
	import type { Attachment } from '$lib/api/personalChats.js';

	interface Props {
		attachment: Attachment;
		onopen?: () => void;
	}

	let { attachment, onopen }: Props = $props();

	let loaded = $state(false);

	// Fires the loaded callback even when the video is already in the browser
	// cache (in which case loadedmetadata/loadeddata may have fired before Svelte
	// attached the listener).
	function videoLoaded(node: HTMLVideoElement, callback: () => void) {
		if (node.readyState >= 1) {
			callback();
			return {};
		}
		const onReady = () => callback();
		node.addEventListener('loadedmetadata', onReady, { once: true });
		node.addEventListener('loadeddata', onReady, { once: true });
		return {
			destroy() {
				node.removeEventListener('loadedmetadata', onReady);
				node.removeEventListener('loadeddata', onReady);
			}
		};
	}
</script>

<button type="button" class="media-trigger video-preview" onclick={() => onopen?.()} aria-label={attachment.filename}>
	<div class="video-skeleton" class:skeleton-hidden={loaded}></div>
	<!-- svelte-ignore a11y_media_has_caption -->
	<video
		use:videoLoaded={() => (loaded = true)}
		src={resolveUrl(attachment.url)}
		crossorigin={blobCrossOrigin}
		class="attachment-video"
		class:video-loaded={loaded}
		preload="metadata"
		muted
	></video>
	<span class="play-btn" aria-hidden="true">
		<Play size={28} fill="white" />
	</span>
</button>

<style>
	.media-trigger {
		display: block;
		width: 100%;
		height: 100%;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		color: inherit;
	}

	.attachment-video {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		background: black;
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	.attachment-video.video-loaded {
		opacity: 1;
	}

	.video-preview {
		position: relative;
	}

	.video-skeleton {
		position: absolute;
		inset: 0;
		background: var(--c-bg-3);
		overflow: hidden;
		z-index: 1;
		opacity: 1;
		transition: opacity 0.3s ease;
	}

	.video-skeleton.skeleton-hidden {
		opacity: 0;
		pointer-events: none;
	}

	.video-skeleton::after {
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

	.play-btn {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 52px;
		height: 52px;
		border-radius: 50%;
		border: none;
		background: rgba(0, 0, 0, 0.5);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		pointer-events: none;
		transition: background var(--duration-fast) var(--ease-default);
	}
</style>
