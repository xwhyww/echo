<script lang="ts">
	import SidebarItem from '$lib/components/sidebar/SidebarItem.svelte';
	import { User, Loader } from 'lucide-svelte';
	import SidebarSearchHeader from '$lib/components/sidebar/SidebarSearchHeader.svelte';
	import { auth } from '$lib/stores/auth.svelte.js';
	import { page } from '$app/state';
	import { usePersonalChats } from '$lib/hooks/chat/usePersonalChats.svelte.js';
	import { personalChatsStore } from '$lib/stores/personalChats.svelte'
	import { useUserSearch } from '$lib/hooks/user/useUserSearch.svelte.js';
	import { getDraft, isEditingDraft } from '$lib/hooks/chat/chatDrafts.svelte.js';
	import { typingStore } from '$lib/stores/typing.svelte.js';
	import { replaceState } from '$app/navigation';
	import { gotoKeepSearch, lastMessageLabel, lastMessageIcon } from '$lib/utils.js';
	import { tick, untrack } from 'svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);
	import SideBar from '$lib/components/layouts/SideBar/index.svelte'

	const chats = usePersonalChats();

	const userSearch = useUserSearch();
	let searchQuery = $state(page.url.searchParams.get('q') ?? '');

	$effect(() => {
		const q = searchQuery;
		tick().then(() => untrack(() => {
			const url = new URL(page.url);

			if (q.trim()) url.searchParams.set('q', q);
			else url.searchParams.delete('q');

			replaceState(url, {});
		}));
	});
	
	$effect(() => {
		if (filteredChats.length === 0 && isSearching) {
			userSearch.query = searchQuery;
			userSearch.handleInput();
		} else {
			userSearch.query = '';
		}
	});
	
	
	const isSearching = $derived(searchQuery.trim().length > 0);

	const filteredChats = $derived.by(() => {
		const meId = auth.user?.id;
		const list = meId ? personalChatsStore.list.filter((c) => c.user.id !== meId) : personalChatsStore.list;
		if (!isSearching) return list;
		const q = searchQuery.trim().toLowerCase();
		return list.filter((chat) => {
			const name = (chat.user.displayName ?? chat.user.username).toLowerCase();
			return name.includes(q);
		});
	});

	function onUserSelect(user: Parameters<typeof chats.handleUserSelect>[0]) {
		gotoKeepSearch(`/chats/perschat/${user.id}`);
	}

	function onSidebarScroll(e: Event) {
		const el = e.target as HTMLDivElement;

		if (el.scrollHeight - el.scrollTop - el.clientHeight < 100 && chats.hasMore && !chats.loadingMore) {
			chats.loadMore();
		}
	}
</script>

<SideBar
	title={t.nav.chats}
	onSidebarScroll={onSidebarScroll}
>
	<SidebarSearchHeader bind:value={searchQuery} />
	{#if !isSearching}
		<SidebarItem
			name={auth?.user?.displayName || "Notes"}
			chatName="Notes"
			subtitle={t.chat.chatWithYourself}
			avatarUrl={auth.user?.avatarUrl}
			active={page.params.id === auth.user?.id}
			onclick={() => gotoKeepSearch(`/chats/perschat/${auth.user?.id}`)}
		/>
	{/if}
	{#if !isSearching && personalChatsStore.tempChat}
		{@const chat = personalChatsStore.tempChat}
		<SidebarItem
			name={chat.user.displayName ?? chat.user.username}
			avatarUrl={chat.user.avatarUrl}
			subtitle={lastMessageLabel(chat.lastMessage) || '#' + chat.user.username}
			subtitleIcon={lastMessageIcon(chat.lastMessage)}
			online={chat.user.isOnline}
			badge={chat.unreadCount > 0 ? chat.unreadCount : null}
			active={page.params.id === chat.user.id}
			onclick={() => { chats.markRead(chat.id); gotoKeepSearch(`/chats/perschat/${chat.user.id}`); }}
		/>
	{/if}
	{#each filteredChats as chat}
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
			active={page.params.id === chat.user.id}
			onclick={() => { chats.markRead(chat.id); gotoKeepSearch(`/chats/perschat/${chat.user.id}`); }}
		/>
	{/each}
	{#if !isSearching && chats.loadingMore}
		<p class="body-xs text-faint loading-more">{t.common.loading}</p>
	{/if}
	{#if isSearching && filteredChats.length === 0}
			{#if userSearch.searching}
				<div class="search-status body-xs text-faint">
					<Loader size={14} />
					<span>{t.common.searching}</span>
				</div>
			{:else if userSearch.error}
				<div class="search-status error body-xs text-faint">{userSearch.error}</div>
			{:else if userSearch.searched && userSearch.results.length === 0}
				<div class="search-status body-xs text-faint">{t.sidebar.noUsersFound}</div>
			{:else}
				{#each userSearch.results as user}
					<SidebarItem
						name={user.displayName ?? user.username}
						icon={User}
						avatarUrl={user.avatarUrl}
						subtitle={'#' + user.username}
						onclick={() => onUserSelect(user)}
					/>
				{/each}
			{/if}
		{/if}
</SideBar>

<style>
	.loading-more {
		text-align: center;
		padding: var(--sp-2);
	}

	.search-status {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-3) var(--sp-4);
	}

	.search-status.error {
		color: var(--c-error);
	}
</style>
