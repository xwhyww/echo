<script lang="ts">
	import SidebarItem from '$lib/components/sidebar/SidebarItem.svelte';
	import GroupSidebarRow from '$lib/components/sidebar/GroupSidebarRow.svelte';
	import SideBar from '$lib/components/layouts/SideBar/index.svelte';
	import SidebarSearchHeader from '$lib/components/sidebar/SidebarSearchHeader.svelte';
	import { auth } from '$lib/stores/auth.svelte.js';
	import { page } from '$app/state';
	import { usePersonalChats } from '$lib/hooks/chat/usePersonalChats.svelte.js';
	import { useGroups } from '$lib/hooks/groups/useGroups.svelte.js';
	import { personalChatsStore } from '$lib/stores/personalChats.svelte.js';
	import { getDraft, isEditingDraft } from '$lib/hooks/chat/chatDrafts.svelte.js';
	import { typingStore } from '$lib/stores/typing.svelte.js';
	import { gotoKeepSearch, lastMessageLabel, lastMessageIcon } from '$lib/utils.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	const chats = usePersonalChats();
	const groups = useGroups();
	let searchQuery = $state('');

	type Item =
		| { kind: 'pc'; id: string; sortKey: number; chat: (typeof personalChatsStore.list)[number] }
		| { kind: 'gr'; id: string; sortKey: number; group: (typeof groups.list)[number] };

	const items = $derived.by<Item[]>(() => {
		const meId = auth.user?.id;
		const pcItems: Item[] = personalChatsStore.list
			.filter((c) => !meId || c.user.id !== meId)
			.map((chat) => {
				const ts = chat.lastMessage?.createdAt ?? chat.createdAt;
				return { kind: 'pc' as const, id: `pc-${chat.id}`, sortKey: ts ? Date.parse(ts) : 0, chat };
			});
		const grItems: Item[] = groups.list.map((group) => {
			const ts = group.lastMessage?.createdAt ?? group.createdAt;
			return { kind: 'gr' as const, id: `gr-${group.id}`, sortKey: ts ? Date.parse(ts) : 0, group };
		});
		const merged = [...pcItems, ...grItems];
		merged.sort((a, b) => b.sortKey - a.sortKey);
		return merged;
	});

	const filtered = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return items;
		return items.filter((it) => {
			if (it.kind === 'pc') {
				const name = (it.chat.user.displayName ?? it.chat.user.username).toLowerCase();
				return name.includes(q);
			}
			return it.group.name.toLowerCase().includes(q);
		});
	});

	const isSearching = $derived(searchQuery.trim().length > 0);
</script>

<SideBar title={t.nav.allChats}>
	<SidebarSearchHeader bind:value={searchQuery} />

	{#if !isSearching}
		<SidebarItem
			name={auth?.user?.displayName || t.chat.notes}
			chatName="Notes"
			subtitle={t.chat.chatWithYourself}
			avatarUrl={auth.user?.avatarUrl}
			active={page.params.id === auth.user?.id}
			onclick={() => gotoKeepSearch(`/chats/allchats/perschat/${auth.user?.id}`)}
		/>
	{/if}

	{#each filtered as it (it.id)}
		{#if it.kind === 'pc'}
			{@const chat = it.chat}
			{@const isActive = page.params.id === chat.user.id}
			{@const chatDraft = isActive && isEditingDraft(chat.user.id) ? '' : getDraft(chat.user.id)}
			{@const typingUsers = typingStore.getUsersForChat(chat.id)}
			{@const isTyping = typingUsers.length > 0}
			{@const timestamp = chat.lastMessage?.createdAt ?? null}
			<SidebarItem
				name={chat.user.displayName ?? chat.user.username}
				avatarUrl={chat.user.avatarUrl}
				subtitle={isTyping
					? 'typing...'
					: chatDraft
						? `Draft: ${chatDraft}`
						: lastMessageLabel(chat.lastMessage)}
				subtitleIcon={isTyping || chatDraft ? undefined : lastMessageIcon(chat.lastMessage)}
				subtitleAccent={isTyping || !!chatDraft}
				online={chat.user.isOnline}
				badge={chat.unreadCount > 0 ? chat.unreadCount : null}
				messageRead={isTyping ? null : (chat.isLastMessageRead ?? null)}
				reactionEmoji={chat.unseenReaction?.emoji ?? null}
				{timestamp}
				active={isActive}
				onclick={() => { chats.markRead(chat.id); gotoKeepSearch(`/chats/allchats/perschat/${chat.user.id}`); }}
			/>
		{:else}
			{@const g = it.group}
			<GroupSidebarRow
				group={g}
				active={page.params.id === g.id}
				subtitle={g.lastMessage?.content || g.description || t.chat.groupChat}
				basePath="/chats/allchats/groups"
			/>
		{/if}
	{/each}
</SideBar>

