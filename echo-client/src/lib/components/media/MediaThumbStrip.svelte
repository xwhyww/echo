<script lang="ts">
	import { untrack } from 'svelte';
	import emblaCarouselSvelte from 'embla-carousel-svelte';
	import type { EmblaCarouselType } from 'embla-carousel';
	import MediaThumb from '$lib/components/media/MediaThumb.svelte';
	import type { Attachment } from '$lib/api/personalChats.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// The row of thumbnails under the fullscreen viewer. It follows the selection
	// rather than owning it: the parent says which slide is showing, this scrolls
	// to keep it in view, and a click asks for a different one.
	interface Props {
		attachments: Attachment[];
		selected: number;
		onselect: (index: number) => void;
		startIndex?: number;
	}

	let { attachments, selected, onselect, startIndex = 0 }: Props = $props();

	// Embla reads its options once, at init — the snapshot is the point, and
	// `untrack` says so rather than leaving a warning to explain it.
	const options = untrack(() => ({
		align: 'center' as const,
		dragFree: true,
		startIndex,
		duration: 0,
	}));

	let api = $state<EmblaCarouselType | undefined>(undefined);

	$effect(() => {
		api?.scrollTo(selected);
	});
</script>

<!-- data-no-swipe-back: dragged sideways to scrub through thumbnails. -->
<div
	class="thumbs embla"
	data-no-swipe-back
	use:emblaCarouselSvelte={{ options, plugins: [] }}
	onemblaInit={(e: CustomEvent<EmblaCarouselType>) => (api = e.detail)}
>
	<div class="embla__container thumbs__container">
		{#each attachments as a, i (a.id)}
			<button
				type="button"
				class="thumb"
				class:is-selected={selected === i}
				onclick={() => onselect(i)}
				aria-label={t.media.openFile(a.filename)}
			>
				<MediaThumb
					url={a.url}
					thumbUrl={a.thumbUrl}
					filename={a.filename}
					mimeType={a.mimeType}
				/>
			</button>
		{/each}
	</div>
</div>

<style>
	.embla {
		overflow: hidden;
		width: 100%;
		height: 100%;
	}

	.embla__container {
		display: flex;
		height: 100%;
	}

	.thumbs {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: center;
		padding: 0 var(--sp-2);
		width: 100%;
		flex-shrink: 0;
	}

	.thumbs__container {
		gap: var(--sp-2);
		height: 64px;
	}

	.thumb {
		position: relative;
		flex: 0 0 88px;
		height: 64px;
		border: 2px solid transparent;
		border-radius: var(--radius-sm);
		background: var(--c-bg-3);
		overflow: hidden;
		cursor: pointer;
		opacity: 0.55;
		transition:
			opacity var(--duration-fast) var(--ease-default),
			border-color var(--duration-fast) var(--ease-default);
	}

	.thumb:hover {
		opacity: 0.85;
	}

	.thumb.is-selected {
		opacity: 1;
		border-color: var(--c-accent-solid);
	}
</style>
