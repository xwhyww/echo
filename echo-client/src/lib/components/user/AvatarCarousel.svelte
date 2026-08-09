<script lang="ts">
	import { untrack } from 'svelte';
	import emblaCarouselSvelte from 'embla-carousel-svelte';
	import type { Avatar as AvatarData } from '$lib/api/auth.js';
	import { resolveUrl, blobCrossOrigin } from '$lib/api/client.js';
	import { X, Plus } from 'lucide-svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import MediaViewer from '$lib/components/media/MediaViewer.svelte';
	import { imageAsAttachment } from '$lib/utils/mediaGallery.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// The row of faces on the profile screen: every avatar the user has kept, the
	// lettered fallback that means "no picture", and the tile that adds one.
	// Clicking a face makes it active; the cross on it throws that one away.
	interface Props {
		avatars: AvatarData[];
		activeUrl: string | null;
		disabled?: boolean;
		onUpload: (file: File) => void;
		onSelect: (avatar: AvatarData) => void;
		onDelete: (avatar: AvatarData) => void;
		onClear: () => void;
		username?: string;
	}

	let {
		avatars,
		activeUrl,
		disabled = false,
		onUpload,
		onSelect,
		onDelete,
		onClear,
		username = ''
	}: Props = $props();

	const MAX_AVATARS = 9;
	const showUpload = $derived(avatars.length < MAX_AVATARS);

	let fileInput = $state<HTMLInputElement>();

	// The avatar being shown fullscreen, if any.
	let preview = $state<AvatarData | null>(null);

	/**
	 * One tile, two meanings. Clicking a face you are not wearing picks it;
	 * clicking the one you already wear has nothing left to select, so it opens
	 * the picture instead of firing a no-op request at the server.
	 */
	function activate(avatar: AvatarData, isActive: boolean) {
		if (isActive) preview = avatar;
		else onSelect(avatar);
	}

	// Embla reads its options once, at init — the snapshot is the point, and
	// `untrack` says so rather than leaving a warning to explain it.
	const options = untrack(() => ({
		align: 'start' as const,
		dragFree: true,
		containScroll: 'trimSnaps' as const,
	}));

	function handleFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		// Cleared straight away so picking the same file twice in a row still
		// fires `change` the second time.
		input.value = '';
		if (file) onUpload(file);
	}
</script>

<!-- data-no-swipe-back: dragged sideways to scroll through the avatars. -->
<div
	class="avatar-carousel embla"
	data-no-swipe-back
	use:emblaCarouselSvelte={{ options, plugins: [] }}
>
	<div class="embla__container">
		{#if showUpload}
			<div class="slide">
				<button
					type="button"
					class="avatar-btn upload-btn text-faint"
					{disabled}
					onclick={() => fileInput?.click()}
					aria-label={t.account.uploadAvatar}
				>
					<Plus size={20} />
				</button>
			</div>
		{/if}
		
		{#each avatars as avatar (avatar.id)}
			{@const isActive = avatar.url === activeUrl}
			<div class="slide">
				<button
					type="button"
					class="avatar-btn"
					class:is-active={isActive}
					{disabled}
					onclick={() => activate(avatar, isActive)}
					aria-label={isActive ? t.account.viewAvatar : t.account.selectAvatar}
					aria-pressed={isActive}
				>
					<img src={resolveUrl(avatar.url)} crossorigin={blobCrossOrigin} alt="" />
				</button>
				<button
					type="button"
					class="delete-btn text-faint"
					{disabled}
					onclick={() => onDelete(avatar)}
					aria-label={t.account.deleteAvatar}
				>
					<X size={12} />
				</button>
			</div>
		{/each}

		{#if avatars.length > 0}
			<div class="slide">
				<button
					type="button"
					class="avatar-btn clear-btn"
					class:is-active={!activeUrl}
					{disabled}
					onclick={onClear}
					aria-label={t.account.removeAvatar}
					aria-pressed={!activeUrl}
				>
					<Avatar name={username || '?'} size={72} />
				</button>
			</div>
		{/if}
	</div>
</div>

{#if username}
	<span class="body-sm text-muted">{username}</span>
{/if}

<input
	bind:this={fileInput}
	type="file"
	accept="image/*"
	hidden
	onchange={handleFileChange}
/>

{#if preview}
	<MediaViewer
		attachments={[imageAsAttachment(preview.id, preview.url, username || preview.id)]}
		onclose={() => (preview = null)}
	/>
{/if}

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;
	
	.embla {
		overflow: hidden;
		width: 100%;
	}

	.embla__container {
		display: flex;
		gap: var(--sp-3);
		/* Room for the active tile's thicker ring and for the delete cross, both
		   of which sit outside the 72px face. */
		padding: var(--sp-2) var(--sp-1);
	}

	/* Fixed basis rather than `flex: 0 0 auto`: every tile is the same width, so
	   the active one growing does not shove its neighbours sideways. */
	.slide {
		position: relative;
		flex: 0 0 72px;
		height: 72px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.avatar-btn {
		width: 72px;
		height: 72px;
		border-radius: var(--radius-full);
		overflow: hidden;
		cursor: pointer;
		border: 2px solid var(--c-border);
		background: var(--c-bg-3);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		transition:
			border-color var(--duration-fast) var(--ease-default),
			transform var(--duration-fast) var(--ease-default);
	}

	.avatar-btn:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.avatar-btn img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* Scaled rather than resized: a wider box would reflow the strip, a transform
	   only paints. The cursor carries the second meaning of the active tile:
	   there is nothing left to select on it, so it opens the picture. */
	.avatar-btn.is-active {
		border-color: var(--c-accent-solid);
		transform: scale(1.08);
		cursor: zoom-in;
	}

	.upload-btn {
		border-style: dashed;
		@include glass;
	}

	.delete-btn {
		position: absolute;
		top: -4px;
		right: -4px;
		width: 20px;
		height: 20px;
		border-radius: var(--radius-full);
		background: var(--c-bg-1);
		border: 1px solid var(--c-border);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: opacity var(--duration-fast) var(--ease-default);
		@include glass;
	}

	.delete-btn:disabled {
		cursor: not-allowed;
	}
</style>
