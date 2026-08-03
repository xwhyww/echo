<script lang="ts">
	import FriendRow from '$lib/components/friends/FriendRow.svelte';
	import LoadMore from '$lib/components/ui/LoadMore.svelte';
	import LoadState from '$lib/components/ui/LoadState.svelte';
	import UndoBar from '$lib/components/ui/UndoBar.svelte';
	import PageColumn from '$lib/components/layouts/PageColumn.svelte';
	import { useContactsList } from '$lib/hooks/friends/useContactsList.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	const contacts = useContactsList();
</script>

<PageColumn>
	<LoadState
		loading={contacts.loading}
		empty={contacts.items.length === 0 ? t.friendsPage.noFriends : null}
	>
		<div class="list">
			{#each contacts.items as friend (friend.id)}
				<FriendRow user={friend} onopen={() => contacts.open(friend.id)} />
			{/each}
			{#if contacts.hasMore}
				<LoadMore loading={contacts.loadingMore} onload={contacts.loadMore} />
			{/if}
		</div>
	</LoadState>
</PageColumn>

{#if contacts.pendingRemoveId}
	<UndoBar
		message={t.friendsPage.removingFriend}
		onconfirm={contacts.commitRemove}
		oncancel={contacts.cancelRemove}
		duration={2000}
	/>
{/if}

<style>
	.list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
</style>
