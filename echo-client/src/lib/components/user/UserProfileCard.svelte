<script lang="ts">
	import type { Snippet } from 'svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import ProfileAvatarCarousel from '$lib/components/user/ProfileAvatarCarousel.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { User, Avatar as AvatarData } from '$lib/api/auth.js';

	const t = $derived(i18n.t);

	// The identity block at the top of a profile: face, name, presence. A
	// restricted profile shows a plain avatar and no presence — the server
	// withholds both — so `avatars` empty plus `showPresence` false covers it.
	interface Props {
		user: User;
		displayName: string;
		avatars?: AvatarData[];
		showPresence?: boolean;
		actions?: Snippet;
	}

	let { user, displayName, avatars = [], showPresence = true, actions }: Props = $props();
</script>

<div class="profile-card">
	<div class="avatar-section">
		{#if showPresence && user.status}
			<p class="status body-sm text-muted italic">{user.status}</p>
		{/if}

		{#if avatars.length}
			<ProfileAvatarCarousel {avatars} name={displayName} fallbackUrl={user.avatarUrl} />
		{:else}
			<Avatar name={displayName} avatarUrl={showPresence ? user.avatarUrl : null} size={120} />
		{/if}

		<div class="user-info">
			<h1 class="heading-xl lh-none">{displayName}</h1>
			{#if showPresence}
				<p class="online-label body-sm lh-tight" class:online={user.isOnline}>
					{user.isOnline ? t.common.online : t.common.offline}
				</p>
			{/if}
		</div>
	</div>

	{@render actions?.()}
</div>

<style>
	.profile-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-4);
	}

	.avatar-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-3);
		position: relative;
	}

	/* Parked over the avatar's shoulder; grows to full text on hover rather
	   than pushing the layout around at rest. */
	.status {
		position: absolute;
		background-color: var(--c-surface-active);
		border-radius: 24px;
		padding: 8px 12px;
		top: -10px;
		z-index: 2;
		left: calc(100% - 40px);
		max-width: 200px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		transition: max-width var(--duration-fast) var(--ease-default);
	}

	.user-info {
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		align-items: center;
		margin: var(--sp-2) 0;
	}

	.online-label {
		color: var(--c-offline);
	}

	.online-label.online {
		color: var(--c-online);
	}
</style>
