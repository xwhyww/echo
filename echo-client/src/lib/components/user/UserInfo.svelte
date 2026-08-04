<script lang="ts">
	import Avatar from '$lib/components/user/Avatar.svelte';
	import { getDisplayName } from '$lib/utils.js';

	interface Props {
		displayName?: string | null;
		username?: string;
		avatarUrl?: string | null;
		size?: 'sm' | 'md' | 'mm' | 'lg' | 'xl' | 'sidebar';
		showName?: boolean;
	}

	let { displayName, username, avatarUrl, size = 'md', showName = true }: Props = $props();

	const name = $derived(getDisplayName(displayName, username));

	const sizeMap = { sm: 32, md: 36, mm: 48, lg: 60, xl: 112, sidebar: 50 };
</script>

<div class="user-info user-info-{size}">
	<Avatar {name} {avatarUrl} size={sizeMap[size]} />
	{#if showName}
		<span class="username truncate body-xs text-muted">{name}</span>
	{/if}
</div>

<style>
	.user-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-1);
	}

	.username {
		max-width: 100%;
		text-align: center;
	}
</style>
