<script lang="ts">
	import { resolveUrl, blobCrossOrigin } from '$lib/api/client.js';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	type AnyComponent = any;

	interface Props {
		name: string;
		avatarUrl?: string | null;
		icon?: AnyComponent;
		online?: boolean | null;
		size?: number;
	}

	let {
		name,
		avatarUrl = null,
		icon,
		online = null,
		size = 42,
	}: Props = $props();

	// Identity colours, hashed per user — a full muted wheel on purpose, so
	// two people are never hard to tell apart. Deliberately NOT derived from
	// the accent: these have to stay distinct from each other, not match the
	// brand.
	const AVATAR_COLORS = [
		'rgba(193, 97, 74, 1)',   // terracotta
		'rgba(184, 117, 74, 1)',  // burnt sienna
		'rgba(168, 122, 62, 1)',  // amber
		'rgba(180, 142, 78, 1)',  // wheat
		'rgba(155, 138, 70, 1)',  // ochre
		'rgba(132, 142, 70, 1)',  // olive
		'rgba(111, 138, 78, 1)',  // sage
		'rgba(78, 132, 96, 1)',   // moss
		'rgba(63, 138, 110, 1)',  // pine
		'rgba(58, 130, 138, 1)',  // teal
		'rgba(70, 110, 148, 1)',  // dusk blue
		'rgba(92, 104, 158, 1)',  // slate indigo
		'rgba(122, 92, 168, 1)',  // muted violet
		'rgba(150, 86, 154, 1)',  // plum
		'rgba(168, 78, 122, 1)',  // mulberry
		'rgba(174, 86, 96, 1)',   // dusty rose
		'rgba(160, 84, 70, 1)',   // clay
		'rgba(138, 96, 74, 1)',   // walnut
	];

	function getInitials(value: string): string {
		const parts = value.trim().split(/\s+/).filter(Boolean);
		if (parts.length === 0) return '?';
		if (parts.length === 1) {
			const first = Array.from(parts[0]).slice(0, 2).join('');
			return first.toUpperCase();
		}
		return (parts[0][0] + parts[1][0]).toUpperCase();
	}

	function getColor(value: string): string {
		let hash = 0;
		for (let i = 0; i < value.length; i++) {
			hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
		}
		return AVATAR_COLORS[hash % AVATAR_COLORS.length];
	}

	let imgFailed = $state(false);
	let thumbFailed = $state(false);

	$effect(() => {
		// Reset failure state when the URL changes
		avatarUrl;
		imgFailed = false;
		thumbFailed = false;
	});

	// Avatars are blob-service URLs of the form `/blobs/files/{hash}.{ext}`.
	// The thumb endpoint serves a 200px WebP at `/blobs/files/{hash}_thumb.webp`.
	// Try the thumb first; on 404 (older avatar uploaded before thumbnails) the
	// onerror handler swaps to the full URL, then to initials if that also fails.
	function deriveThumbUrl(url: string): string | null {
		const m = /^(.*\/blobs\/files\/)([a-f0-9]{64})\.[a-z0-9]+$/i.exec(url);
		if (!m) return null;
		return `${m[1]}${m[2]}_thumb.webp`;
	}

	const thumbCandidate = $derived(avatarUrl ? deriveThumbUrl(avatarUrl) : null);
	const activeUrl = $derived(
		avatarUrl ? (thumbCandidate && !thumbFailed ? thumbCandidate : avatarUrl) : null,
	);

	const initials = $derived(getInitials(name));
	const fallbackColor = $derived(getColor(name));
	const showFallback = $derived(!avatarUrl || imgFailed);
	const iconSize = $derived(Math.round(size / 2));
</script>

<div
	class="avatar text-muted"
	style:width="{size}px"
	style:height="{size}px"
	style:--avatar-size="{size}px"
	style:background={showFallback && !icon ? fallbackColor : undefined}
>
	{#if activeUrl && !imgFailed}
		<img
			class="avatar-img text-muted"
			src={resolveUrl(activeUrl)}
			crossorigin={blobCrossOrigin}
			alt={name}
			onerror={() => {
				if (!thumbFailed && thumbCandidate) {
					thumbFailed = true;
				} else {
					imgFailed = true;
				}
			}}
		/>
	{:else if icon}
		{@const Icon = icon}
		<Icon size={iconSize} />
	{:else}
		<span class="avatar-initials overline fw-semibold text-muted">{initials}</span>
	{/if}
	{#if online !== null}
		<span class="status-indicator" class:online></span>
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.avatar {
		position: relative;
		border-radius: var(--radius-full);
		background: var(--c-bg-4);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;

		@include glass-less;
	}

	.avatar-img {
		width: 100%;
		height: 100%;
		border-radius: var(--radius-full);
		object-fit: cover;
	}

	.avatar-initials {
		font-size: calc(var(--avatar-size) * 0.3);
		color: white;
		user-select: none;
	}

	.status-indicator {
		position: absolute;
		bottom: -1px;
		right: -1px;
		width: 12px;
		height: 12px;
		border-radius: var(--radius-full);
		background: var(--c-offline);
		border: 2px solid var(--c-bg-2);
	}

	.status-indicator.online {
		background: var(--c-online);
	}
</style>
