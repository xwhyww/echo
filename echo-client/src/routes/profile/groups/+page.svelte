<script lang="ts">
	import { Plus, Users } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CreateGroupModal from '$lib/components/groups/CreateGroupModal.svelte';
	import GroupListRow from '$lib/components/groups/GroupListRow.svelte';
	import LoadState from '$lib/components/ui/LoadState.svelte';
	import PageColumn from '$lib/components/layouts/PageColumn.svelte';
	import { useGroups } from '$lib/hooks/groups/useGroups.svelte.js';
	import { gotoKeepSearch } from '$lib/utils.js';
	import { routes } from '$lib/routes.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	const groups = useGroups();

	let showCreate = $state(false);
</script>

<PageColumn maxWidth="720px" paddingTop="0">
	<header class="head">
		<div class="head-title">
			<h1 class="heading-xl">{t.groupsPage.title}</h1>
			<Button variant="primary" onclick={() => (showCreate = true)}>
				<Plus size={16} /> {t.groupsPage.create}
			</Button>
		</div>
		<p class="body-sm text-faint">{t.groupsPage.subtitle}</p>
	</header>

	<LoadState loading={!groups.loaded}>
		{#if groups.list.length === 0}
			<div class="empty text-faint">
				<Users size={28} />
				<p class="body-sm">{t.groupsPage.emptyText}</p>
				<Button variant="primary" onclick={() => (showCreate = true)}>
					<Plus size={16} /> {t.groupsPage.createFirst}
				</Button>
			</div>
		{:else}
			<div class="group-list">
				{#each groups.list as g (g.id)}
					<GroupListRow
						name={g.name}
						avatarUrl={g.avatarUrl}
						description={g.description}
						role={g.role}
						onclick={() => gotoKeepSearch(routes.chats.group(g.id))}
					/>
				{/each}
			</div>
		{/if}
	</LoadState>
</PageColumn>

{#if showCreate}
	<CreateGroupModal onclose={() => (showCreate = false)} />
{/if}

<style>
	.head {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.head-title {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-3);
	}

	.head h1,
	.head p {
		margin: 0;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-8);
	}

	.empty p {
		margin: 0;
	}

	.group-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
</style>
