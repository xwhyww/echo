<script lang="ts">
	import SideBar from '$lib/components/layouts/SideBar/index.svelte';
	import SidebarItem from '$lib/components/sidebar/SidebarItem.svelte';
	import { Users, ArrowDownToLine, ArrowUpFromLine } from 'lucide-svelte';
	import { page } from '$app/state';
	import { routes } from '$lib/routes.js';
	import { friendsStore } from '$lib/stores/friends.svelte.js';
	import { gotoKeepSearch } from '$lib/utils.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);


</script>

<SideBar title={t.nav.friends}>
	<SidebarItem
		size="s"
		name="My friends"
		icon={Users}
		active={false}
		onclick={() => gotoKeepSearch(routes.friends.contacts)}
	/>
	<SidebarItem
		size="s"
		name="Incoming requests"
		icon={ArrowDownToLine}
		badge={friendsStore.incomingCount > 0 ? friendsStore.incomingCount : null}
		active={false}
		onclick={() => gotoKeepSearch(routes.friends.incoming)}
	/>
	<SidebarItem
		size="s"
		name="Outgoing requests"
		icon={ArrowUpFromLine}
		active={false}
		onclick={() => gotoKeepSearch(routes.friends.outgoing)}
	/>
</SideBar>
