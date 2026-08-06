<script lang="ts">
	import type { Snippet } from 'svelte';
	import SidebarItem from '$lib/components/sidebar/SidebarItem.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { User } from '$lib/api/auth.js';

	const t = $derived(i18n.t);

	// One person in any people list — friends, incoming requests, outgoing
	// requests. The buttons on the right differ per list, so they arrive as a
	// snippet; everything else is the same row.
	interface Props {
		user: User | undefined;
		/** Makes the whole row a link to the profile. Clicks on the actions are ignored. */
		onopen?: () => void;
		actions?: Snippet;
	}

	let { user, onopen, actions }: Props = $props();

	function onclick(e: MouseEvent) {
		if (!onopen) return;
		// The buttons live inside the row, so a click on one must not also
		// navigate away from the list.
		if ((e.target as HTMLElement | null)?.closest('.friend-row-actions')) return;
		onopen();
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="friend-row" class:clickable={!!onopen} {onclick}>
	<SidebarItem
		name={user?.displayName ?? user?.username ?? t.common.unknown}
		avatarUrl={user?.avatarUrl}
		subtitle={user ? `@${user.username}` : ''}
		online={user?.isOnline}
	/>
	{#if actions}
		<div class="friend-row-actions">{@render actions()}</div>
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.friend-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-right: var(--sp-2);
		border-radius: var(--radius-md);
		@include glass;
	}

	.friend-row.clickable {
		cursor: pointer;
	}

	.friend-row-actions {
		display: flex;
		gap: var(--sp-2);
		flex-shrink: 0;
	}
</style>
