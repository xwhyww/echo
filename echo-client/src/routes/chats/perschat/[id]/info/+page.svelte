<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/components/ui/Button.svelte';
	import ChatInfoPage from '$lib/components/chat/ChatInfoPage.svelte';
	import { usePersonalChatInfo } from '$lib/hooks/chat/usePersonalChatInfo.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import { User } from 'lucide-svelte';

	const info = usePersonalChatInfo(() => page.params.id ?? '');
	const t = $derived(i18n.t);
</script>

<ChatInfoPage
	title={info.title}
	avatarName={info.displayName}
	avatarUrl={info.avatarUrl}
	username={info.isSelf ? null : (info.companion?.username ?? null)}
	items={info.items}
	onmedia={info.openMedia}
>
	{#snippet actions()}
		{#if !info.isSelf}
			<Button variant="ghost" onclick={info.openProfile}>
				<User size={16} />
				{t.chat.viewProfile}
			</Button>
		{/if}
	{/snippet}
</ChatInfoPage>
