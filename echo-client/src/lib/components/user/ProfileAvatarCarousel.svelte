<script lang="ts">
	import { ChevronLeft, ChevronRight } from 'lucide-svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { Avatar as AvatarData } from '$lib/api/auth.js';

	const t = $derived(i18n.t);

	// Read-only browsing of the avatars someone has published. The editable
	// cloud on one's own profile is `AvatarCarousel` — different job, different
	// component.
	interface Props {
		avatars: AvatarData[];
		name: string;
		/** Shown when the person has no avatars at all. */
		fallbackUrl?: string | null;
		size?: number;
	}

	let { avatars, name, fallbackUrl = null, size = 120 }: Props = $props();

	let index = $state(0);

	// A shorter list after navigation would leave the index out of range.
	$effect(() => {
		if (index >= avatars.length) index = 0;
	});

	const many = $derived(avatars.length > 1);
	const currentUrl = $derived(avatars[index]?.url ?? fallbackUrl);

	function step(delta: number) {
		index = (index + delta + avatars.length) % avatars.length;
	}
</script>

<div class="carousel" class:has-many={many}>
	<Avatar {name} avatarUrl={currentUrl} {size} />

	{#if many}
		<button
			class="carousel-arrow left text-muted"
			onclick={() => step(-1)}
			aria-label={t.common.previous}
		>
			<ChevronLeft size={20} />
		</button>
		<button
			class="carousel-arrow right text-muted"
			onclick={() => step(1)}
			aria-label={t.common.next}
		>
			<ChevronRight size={20} />
		</button>
	{/if}
</div>

{#if many}
	<div class="carousel-dots">
		{#each avatars as avatar, i (avatar.id)}
			<button
				class="dot"
				class:active={i === index}
				onclick={() => (index = i)}
				aria-label={`${i + 1}`}
			></button>
		{/each}
	</div>
{/if}

<style lang="scss">
	@use '$lib/styles/layout.mixin' as *;

	.carousel {
		position: relative;

		@include flex-center;
	}

	.carousel-arrow {
		position: absolute;
		top: 50%;
		translate: 0 -50%;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-full);
		background: var(--c-bg-2);
		opacity: 0;
		transition: opacity var(--duration-fast) var(--ease-default),
			color var(--duration-fast) var(--ease-default),
			background var(--duration-fast) var(--ease-default);

		@include flex-center;
	}

	.carousel.has-many:hover .carousel-arrow {
		opacity: 1;
	}

	.carousel-arrow:hover {
		background: var(--c-bg-3);
		color: var(--c-text);
	}

	.carousel-arrow.left {
		left: -44px;
	}

	.carousel-arrow.right {
		right: -44px;
	}

	.carousel-dots {
		display: flex;
		gap: var(--sp-1);
		justify-content: center;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-full);
		background: var(--c-border);
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);
	}

	.dot:hover {
		background: var(--c-text-muted);
	}

	.dot.active {
		background: var(--c-accent);
	}
</style>
