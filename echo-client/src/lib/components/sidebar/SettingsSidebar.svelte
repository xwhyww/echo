<script lang="ts">
	import SideBar from '$lib/components/layouts/SideBar/index.svelte';
	import SidebarItem from '$lib/components/sidebar/SidebarItem.svelte';
	import { UserRound, Shield, Bell, Users, Mic, Languages } from 'lucide-svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { gotoKeepSearch } from '$lib/utils.js';
	import { routes } from '$lib/routes.js';
	import { auth } from '$lib/stores/auth.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const activePath = $derived(page.url.pathname);
	const t = $derived(i18n.t);

	function handleLogout() {
		auth.logout();
		goto(routes.login);
	}
</script>

<SideBar title={t.settings.title}>
	<SidebarItem
		size="s"
		name={t.settings.myAccount}
		icon={UserRound}
		active={activePath === routes.profile.root}
		onclick={() => gotoKeepSearch(routes.profile.root)}
	/>
	<SidebarItem
		size="s"
		name={t.settings.privacy}
		icon={Shield}
		active={activePath === routes.profile.privacy}
		onclick={() => gotoKeepSearch(routes.profile.privacy)}
	/>
	<SidebarItem
		size="s"
		name={t.settings.notifications}
		icon={Bell}
		active={activePath === routes.profile.notifications}
		onclick={() => gotoKeepSearch(routes.profile.notifications)}
	/>
	<SidebarItem
		size="s"
		name={t.settings.groups}
		icon={Users}
		active={activePath === routes.profile.groups}
		onclick={() => gotoKeepSearch(routes.profile.groups)}
	/>
	<SidebarItem
		size="s"
		name={t.settings.microphone}
		icon={Mic}
		active={activePath === routes.profile.audio}
		onclick={() => gotoKeepSearch(routes.profile.audio)}
	/>
	<SidebarItem
		size="s"
		name={t.settings.language}
		icon={Languages}
		active={activePath === routes.profile.language}
		onclick={() => gotoKeepSearch(routes.profile.language)}
	/>
	<SidebarItem
		size="s"
		name={t.settings.logOut}
		danger
		noAvatar
		onclick={handleLogout}
	/>
</SideBar>
