<script lang="ts">
	import SidebarItem from '$lib/components/sidebar/SidebarItem.svelte';
	import SideBar from '$lib/components/layouts/SideBar/index.svelte';
	import GroupSidebarRow from '$lib/components/sidebar/GroupSidebarRow.svelte';
	import SidebarSearchHeader from '$lib/components/sidebar/SidebarSearchHeader.svelte';
	import { Inbox, Users } from 'lucide-svelte';
	import { useGroups } from '$lib/hooks/groups/useGroups.svelte.js';
	import { gotoKeepSearch } from '$lib/utils.js';
	import { page } from '$app/state';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	const groups = useGroups();
	let searchQuery = $state('');

	const filtered = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return groups.list;
		return groups.list.filter((g) => g.name.toLowerCase().includes(q));
	});
</script>

<SideBar title={t.nav.groups}>
	<SidebarSearchHeader bind:value={searchQuery} placeholder={t.sidebar.searchGroups} />

	<SidebarItem
		name={t.nav.invites}
		icon={Inbox}
		subtitle={groups.invites.length === 0
			? t.sidebar.noPendingInvites
			: t.sidebar.pendingInvites(groups.invites.length)}
		badge={groups.invites.length > 0 ? groups.invites.length : null}
		active={page.url.pathname === '/chats/groups/invites'}
		onclick={() => gotoKeepSearch('/chats/groups/invites')}
	/>

	{#if filtered.length === 0 && groups.loaded}
		<div class="empty text-faint">
			<Users size={20} />
			<p class="body-sm">{t.sidebar.noGroupsYet}</p>
			<p class="hint body-xs">{t.sidebar.createOrAcceptInvite}</p>
		</div>
	{/if}

	{#each filtered as g (g.id)}
		<GroupSidebarRow
			group={g}
			active={page.params.id === g.id}
			subtitle={g.lastMessage?.content || g.description || t.chat.groupChat}
		/>
	{/each}
</SideBar>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-1);
		padding: var(--sp-6) var(--sp-4);
		text-align: center;
	}

	.empty p { margin: 0; }
</style>
