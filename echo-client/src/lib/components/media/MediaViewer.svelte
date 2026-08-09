<script lang="ts">
	import { X, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import { untrack } from 'svelte';
	import emblaCarouselSvelte from 'embla-carousel-svelte';
	import type { EmblaCarouselType } from 'embla-carousel';
	import MediaThumbStrip from '$lib/components/media/MediaThumbStrip.svelte';
	import { resolveUrl, blobCrossOrigin } from '$lib/api/client';
	import type { Attachment } from '$lib/api/personalChats.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		attachments: Attachment[];
		startIndex?: number;
		onclose: () => void;
	}

	let { attachments, startIndex = 0, onclose }: Props = $props();

	const safeStart = untrack(() => Math.max(0, Math.min(startIndex, attachments.length - 1)));
	let selected = $state(safeStart);
	const hasMany = untrack(() => attachments.length > 1);

	let mainApi: EmblaCarouselType | undefined;

	const mainOptions = { loop: false, startIndex: safeStart, duration: 0 };

	// `selected` is the one piece of shared truth: the strip follows it, and
	// clicking a thumb comes back through `scrollTo` rather than setting it.
	function onMainInit(e: CustomEvent<EmblaCarouselType>) {
		mainApi = e.detail;
		mainApi.on('select', () => {
			if (mainApi) selected = mainApi.selectedScrollSnap();
		});
	}

	function scrollPrev() {
		mainApi?.scrollPrev();
	}

	function scrollNext() {
		mainApi?.scrollNext();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onclose();
		} else if (e.key === 'ArrowLeft') {
			scrollPrev();
		} else if (e.key === 'ArrowRight') {
			scrollNext();
		}
	}

	/**
	 * Everything dismisses except the content and the controls.
	 *
	 * `e.target === e.currentTarget` can't express that: the overlay is a
	 * centering flex container wrapping `.viewer`, so a click lands on the
	 * viewer, an embla wrapper or a slide long before it lands on the overlay
	 * itself — the equality was almost never true. Ask what was clicked instead.
	 *
	 * The nav arrows have to be listed or paging would dismiss the viewer on the
	 * first click. `.close-btn` is listed because it already calls `onclose` on
	 * its own; without it the handler would fire a second time.
	 *
	 * Drag-to-swipe is not a concern here — embla swallows the synthetic click
	 * that follows a drag, so a gesture never reaches this.
	 */
	const KEEP_OPEN = '.media, .thumbs, .nav-btn, .close-btn';

	function handleBackdrop(e: MouseEvent) {
		if ((e.target as Element | null)?.closest(KEEP_OPEN)) return;
		onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- data-no-swipe-back: the carousel below owns horizontal drags — swiping right
     here means "previous photo", not "leave the page". -->
<div
	class="overlay"
	onclick={handleBackdrop}
	role="dialog"
	aria-modal="true"
	tabindex="-1"
	data-no-swipe-back
>
	<button class="close-btn" onclick={onclose} aria-label={t.common.close}>
		<X size={22} />
	</button>

	<div class="viewer">
		<div class="body">
			<div class="embla" use:emblaCarouselSvelte={{ options: mainOptions, plugins: [] }} onemblaInit={onMainInit}>
				<div class="embla__container">
					{#each attachments as a (a.id)}
						<div class="embla__slide">
							{#if a.mimeType.startsWith('video/')}
								<!-- svelte-ignore a11y_media_has_caption -->
								<video src={resolveUrl(a.url)} crossorigin={blobCrossOrigin} class="media" controls preload="metadata"></video>
							{:else}
								<img src={resolveUrl(a.url)} crossorigin={blobCrossOrigin} alt={a.filename} class="media" />
							{/if}
						</div>
					{/each}
				</div>
			</div>

			{#if hasMany}
				<button class="nav-btn nav-prev" onclick={scrollPrev} aria-label={t.media.previous}>
					<ChevronLeft size={16} />
				</button>
				<button class="nav-btn nav-next" onclick={scrollNext} aria-label={t.media.next}>
					<ChevronRight size={16} />
				</button>
			{/if}
		</div>

		{#if hasMany}
			<MediaThumbStrip
				{attachments}
				{selected}
				startIndex={safeStart}
				onselect={(i) => mainApi?.scrollTo(i)}
			/>
		{/if}
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;
	
	.overlay {
		position: fixed;
		inset: 0;
		z-index: var(--z-modal);
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.viewer {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-3);
		/* Capped rather than filling the screen: edge to edge there is nothing to
		   frame the photo, the close button sits on top of it, and on a wide
		   display a small image would be scaled up past its own resolution. */
		max-width: min(100%, 900px);
		max-height: 100%;
	}

	.body {
		position: relative;
	
	}

	.embla {
		overflow: hidden;
		width: 100%;
		height: 100%;
	}

	.embla__container {
		display: flex;
		height: 100%;
	}

	.embla__slide {
		flex: 0 0 100%;
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 var(--sp-2);
		box-sizing: border-box;
		height: calc(100vh - 300px);
	}

	.media {
		max-width: 100%;
		/* Leaves room top and bottom for the chrome — and, more to the point,
		   stops the photo reaching both screen edges. `contain` means this only
		   ever shrinks it; nothing is cropped or stretched. */
		max-height: calc(100vh - 300px);
		object-fit: contain;
		display: block;
		border-radius: var(--radius-sm);
	}

	.close-btn {
		position: absolute;
		top: calc(var(--safe-top) + 12px);
		right: 12px;
		border: none;
		background: transparent;
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);
		z-index: 2;
		@include glass;
		border-radius: var(--radius-full);
		padding: var(--sp-3);
	}

	.nav-btn {
		opacity: 0;
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: none;
		background: rgba(0, 0, 0, 0.5);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);
		z-index: 2;
	}

	.nav-prev {
		left: var(--sp-3);
	}

	.nav-next {
		right: var(--sp-3);
	}

	/* The thumb strip, its tiles and their pictures belong to
	   MediaThumbStrip / MediaThumb. */
</style>
