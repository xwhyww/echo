<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/components/ui/Button.svelte';
	import ChatInfoPage from '$lib/components/chat/ChatInfoPage.svelte';
	import { useGroupInfo } from '$lib/hooks/groups/useGroupInfo.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import { ArrowLeft, Settings, Volume2 } from 'lucide-svelte';

	const info = useGroupInfo(() => page.params.id ?? '');
	const t = $derived(i18n.t);
</script>

<ChatInfoPage
	title={info.group?.name ?? ''}
	avatarUrl={info.group?.avatarUrl}
	description={info.group?.description}
	meta={info.memberCount}
	items={info.items}
	onmedia={info.openMedia}
	loading={info.loading}
>
	{#snippet actions()}
		<Button variant="ghost" onclick={info.openVoice}>
			<Volume2 size={16} />
			{t.groupInfo.voiceChannels}
		</Button>
		<Button variant="ghost" onclick={info.openSettings}>
			<Settings size={16} />
			{t.groupInfo.openSettings}
		</Button>
	{/snippet}
</ChatInfoPage>
