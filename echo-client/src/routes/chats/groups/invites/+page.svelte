<script lang="ts">
	import { Inbox } from 'lucide-svelte';
	import GroupInviteRow from '$lib/components/groups/GroupInviteRow.svelte';
	import PageColumn from '$lib/components/layouts/PageColumn.svelte';
	import { useGroupInvites } from '$lib/hooks/groups/useGroupInvites.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	const invites = useGroupInvites();
</script>

<PageColumn gap="var(--sp-2)">
	{#if invites.invites.length === 0}
		<!-- Not a LoadState: the invite list rides along with the groups the
		     sidebar already has, so there is no load or error of its own. -->
		<div class="empty text-faint">
			<Inbox size={28} />
			<p>{t.invites.noPending}</p>
		</div>
	{:else}
		<ul class="list">
			{#each invites.invites as inv (inv.id)}
				<GroupInviteRow
					groupName={inv.groupName}
					groupAvatarUrl={inv.groupAvatarUrl}
					inviterUsername={inv.inviterUsername}
					busy={invites.isBusy(inv.id)}
					onaccept={() => invites.accept(inv.id)}
					ondecline={() => invites.decline(inv.id)}
				/>
			{/each}
		</ul>
	{/if}
</PageColumn>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--sp-2);
		padding: var(--sp-8);
	}

	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
</style>
