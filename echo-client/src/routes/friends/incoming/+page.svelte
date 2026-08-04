<script lang="ts">
	import { Check, X } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FriendRow from '$lib/components/friends/FriendRow.svelte';
	import LoadMore from '$lib/components/ui/LoadMore.svelte';
	import LoadState from '$lib/components/ui/LoadState.svelte';
	import PageColumn from '$lib/components/layouts/PageColumn.svelte';
	import { useFriendRequests } from '$lib/hooks/friends/useFriendRequests.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	const requests = useFriendRequests('incoming');
</script>

<PageColumn maxWidth="560px">
	<LoadState
		loading={requests.loading}
		empty={requests.items.length === 0 ? t.friendsPage.noIncoming : null}
	>
		<div class="list">
			{#each requests.items as req (req.id)}
				<FriendRow user={req.user}>
					{#snippet actions()}
						<Button
							variant="primary"
							onclick={() => requests.accept(req.requesterId)}
							disabled={requests.acting}
						>
							<Check size={16} />
							{t.common.accept}
						</Button>
						<Button
							variant="ghost"
							onclick={() => requests.decline(req.requesterId)}
							disabled={requests.acting}
						>
							<X size={16} />
							{t.common.decline}
						</Button>
					{/snippet}
				</FriendRow>
			{/each}
			{#if requests.hasMore}
				<LoadMore loading={requests.loadingMore} onload={requests.loadMore} />
			{/if}
		</div>
	</LoadState>
</PageColumn>

<style>
	.list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
</style>
