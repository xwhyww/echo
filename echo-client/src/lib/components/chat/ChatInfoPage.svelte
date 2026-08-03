<script lang="ts">
	import type { Snippet } from 'svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import LoadState from '$lib/components/ui/LoadState.svelte';
	import StatsList, { type StatItem } from '$lib/components/ui/StatsList.svelte';
	import PageColumn from '$lib/components/layouts/PageColumn.svelte';

	// Shared shell for the "info" screens behind a personal chat and a group:
	// centred avatar, title, a couple of optional subtitle lines, an action row
	// and the stat list. Everything that differs between the two surfaces
	// arrives as props or snippets, so the layout lives in exactly one place.
	interface Props {
		title: string;
		/**
		 * Name the avatar derives its initial and colour from. Defaults to
		 * `title`; the two diverge for the self-chat, whose heading reads
		 * "Notes" while the avatar still belongs to the user.
		 */
		avatarName?: string;
		avatarUrl?: string | null;
		/** Rendered as `@username` under the title. */
		username?: string | null;
		/** Free-text line under the title (group description). */
		description?: string | null;
		/** Small muted line under the description (member count). */
		meta?: string | null;
		items: StatItem[];
		onmedia: (kind: NonNullable<StatItem['mediaKind']>) => void;
		/** Hides the body until the surface has its data. */
		loading?: boolean;
		/** Optional chrome above the profile block (e.g. a back button). */
		header?: Snippet;
		/** Buttons under the title — the two surfaces offer different ones. */
		actions?: Snippet;
	}

	let {
		title,
		avatarName,
		avatarUrl = null,
		username = null,
		description = null,
		meta = null,
		items,
		onmedia,
		loading = false,
		header,
		actions,
	}: Props = $props();
</script>

<PageColumn maxWidth="560px" gap="var(--sp-6)">
	{#if header}
		<div class="info-header">{@render header()}</div>
	{/if}

	<LoadState {loading}>
		<div class="profile-section">
			<Avatar name={avatarName ?? title} {avatarUrl} size={96} />
			<h1 class="name heading-xl">{title}</h1>
			{#if username}
				<p class="username body-sm text-muted">@{username}</p>
			{/if}
			{#if description}
				<p class="description body-sm text-muted">{description}</p>
			{/if}
			{#if meta}
				<p class="meta body-sm text-faint">{meta}</p>
			{/if}
			{#if actions}
				<div class="profile-actions">{@render actions()}</div>
			{/if}
		</div>

		<StatsList {items} {onmedia} />
	</LoadState>
</PageColumn>

<style>
	.info-header {
		display: flex;
		align-items: center;
	}

	.profile-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-2);
	}

	.profile-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		justify-content: center;
	}

	.description {
		text-align: center;
		max-width: 420px;
	}
</style>
