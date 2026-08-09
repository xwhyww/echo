<script lang="ts">
	import type { Snippet } from 'svelte';
	import AttachmentImage from '$lib/components/media/AttachmentImage.svelte';
	import AttachmentVideo from '$lib/components/media/AttachmentVideo.svelte';
	import type { Attachment } from '$lib/api/personalChats.js';

	// The photo/video collage at the top of a bubble. One to five items get a
	// bespoke arrangement; six or more fall back to an even three-column grid.
	interface Props {
		attachments: Attachment[];
		/** Square off the bottom corners when text or files sit underneath. */
		hasContentBelow?: boolean;
		onopen?: (index: number) => void;
		oncontextmenu?: (e: MouseEvent, attachment: Attachment) => void;
		/** Drawn over every tile — the upload progress on a message still sending. */
		tileOverlay?: Snippet;
	}

	let {
		attachments,
		hasContentBelow = false,
		onopen,
		oncontextmenu,
		tileOverlay,
	}: Props = $props();
</script>

<div class="attachment-images grid-{Math.min(attachments.length, 6)}" class:has-content-below={hasContentBelow}>
	{#each attachments as m, idx (m.id)}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="attachment-image-wrapper"
			data-att-id={m.id}
			oncontextmenu={(e) => oncontextmenu?.(e, m)}
		>
			{#if m.mimeType.startsWith('image/')}
				<AttachmentImage attachment={m} onopen={() => onopen?.(idx)} />
			{:else}
				<AttachmentVideo attachment={m} onopen={() => onopen?.(idx)} />
			{/if}
			{@render tileOverlay?.()}
		</div>
	{/each}
</div>

<style>
	.attachment-images {
		display: grid;
		gap: 2px;
		border-radius: var(--radius-md);
		overflow: hidden;
		width: 300px;
		max-width: 100%;
	}

	.attachment-images.has-content-below {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	}

	.attachment-image-wrapper {
		position: relative;
		line-height: 0;
		overflow: hidden;
		min-height: 0;
	}

	/* 1 item — single full-width, and wider than the collages: with nothing to
	   share the bubble with, a lone photo has no reason to be letterbox-thin. */
	.attachment-images.grid-1 {
		grid-template-columns: 1fr;
	}

	/* Square rather than 4:3. The tiles crop with `object-fit: cover`, so this is
	   the one shape that treats portrait and landscape photos alike, and it is a
	   third taller than 4:3 on a phone, where the width is the bubble's and
	   cannot grow. */
	.grid-1 .attachment-image-wrapper {
		aspect-ratio: 1;
	}

	/* 2 items — side by side */
	.attachment-images.grid-2 {
		grid-template-columns: 1fr 1fr;
	}

	.grid-2 .attachment-image-wrapper {
		aspect-ratio: 1;
	}

	/* 3 items — one large left, two stacked right. The children size to the
	   rows rather than to an aspect ratio of their own. */
	.attachment-images.grid-3 {
		grid-template-columns: 2fr 1fr;
		grid-template-rows: 1fr 1fr;
	}

	.attachment-images.grid-3 .attachment-image-wrapper:first-child {
		grid-row: 1 / 3;
	}

	/* 4 items — 2x2 grid */
	.attachment-images.grid-4 {
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr;
	}

	.grid-4 .attachment-image-wrapper {
		aspect-ratio: 4 / 3;
	}

	/* 5+ items — 2 on top, 3 below; six columns so both rows divide evenly. */
	.attachment-images.grid-5 {
		grid-template-columns: repeat(6, 1fr);
	}

	.grid-5 .attachment-image-wrapper {
		aspect-ratio: 4 / 3;
	}

	.attachment-images.grid-5 .attachment-image-wrapper:nth-child(1) {
		grid-column: 1 / 4;
	}

	.attachment-images.grid-5 .attachment-image-wrapper:nth-child(2) {
		grid-column: 4 / 7;
	}

	.attachment-images.grid-5 .attachment-image-wrapper:nth-child(3) {
		grid-column: 1 / 3;
	}

	.attachment-images.grid-5 .attachment-image-wrapper:nth-child(4) {
		grid-column: 3 / 5;
	}

	.attachment-images.grid-5 .attachment-image-wrapper:nth-child(5) {
		grid-column: 5 / 7;
	}

	/* 6+ items — an even three-column grid.
	   Previously anything past five reused the five-up rules, which place items
	   1–5 explicitly in a six-column track and leave the sixth to auto-place: it
	   landed in a single column, a sixth of the width, with the row collapsing
	   around it. Past five there is no arrangement worth bespoking, so they all
	   get the same square tile. */
	.attachment-images.grid-6 {
		grid-template-columns: repeat(3, 1fr);
	}

	.grid-6 .attachment-image-wrapper {
		aspect-ratio: 1;
	}
</style>
