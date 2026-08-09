<script lang="ts">
	import SidebarItem from '$lib/components/sidebar/SidebarItem.svelte';
	import GroupSidebarRow from '$lib/components/sidebar/GroupSidebarRow.svelte';
	import SideBar from '$lib/components/layouts/SideBar/index.svelte';
	import SidebarSearchHeader from '$lib/components/sidebar/SidebarSearchHeader.svelte';
	import { User, Loader, Inbox } from 'lucide-svelte';
	import { auth } from '$lib/stores/auth.svelte.js';
	import { page } from '$app/state';
	import { useChatsSidebar } from '$lib/hooks/chat/useChatsSidebar.svelte.js';
	import { getDraft, isEditingDraft } from '$lib/hooks/chat/chatDrafts.svelte.js';
	import { typingStore } from '$lib/stores/typing.svelte.js';
	import { gotoKeepSearch, lastMessageLabel, lastMessageIcon } from '$lib/utils.js';
	import { routes } from '$lib/routes.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	const list = useChatsSidebar();

	const title = $derived(
		list.filter === 'personal'
			? t.nav.personalChats
			: list.filter === 'groups'
				? t.nav.groups
				: t.nav.allChats,
	);
</script>

<SideBar {title} onSidebarScroll={list.onScroll}>
	<SidebarSearchHeader bind:value={list.searchQuery} />

	{#if list.filter === 'groups'}
		<SidebarItem
			name={t.nav.invites}
			icon={Inbox}
			subtitle={list.invites.length === 0
				? t.sidebar.noPendingInvites
				: t.sidebar.pendingInvites(list.invites.length)}
			badge={list.invites.length > 0 ? list.invites.length : null}
			active={page.url.pathname === routes.chats.groupsInvites}
			onclick={() => gotoKeepSearch(routes.chats.groupsInvites)}
		/>
	{/if}

	{#if !list.isSearching && list.filter !== 'groups'}
		<SidebarItem
			name={auth?.user?.displayName || t.chat.notes}
			chatName={t.chat.notes}
			subtitle={t.chat.chatWithYourself}
			avatarUrl={auth.user?.avatarUrl}
			active={page.params.id === auth.user?.id}
			onclick={() => gotoKeepSearch(routes.chats.perschatUser(auth.user?.id ?? ''))}
		/>
	{/if}

	{#if !list.isSearching && list.tempChat}
		{@const chat = list.tempChat}
		<SidebarItem
			name={chat.user.displayName ?? chat.user.username}
			avatarUrl={chat.user.avatarUrl}
			subtitle={lastMessageLabel(chat.lastMessage) || '#' + chat.user.username}
			subtitleIcon={lastMessageIcon(chat.lastMessage)}
			online={chat.user.isOnline}
			badge={chat.unreadCount > 0 ? chat.unreadCount : null}
			active={page.params.id === chat.user.id}
			onclick={() => {
				list.markRead(chat.id);
				gotoKeepSearch(routes.chats.perschatUser(chat.user.id));
			}}
		/>
	{/if}

	{#each list.items as it (it.id)}
		{#if it.kind === 'pc'}
			{@const chat = it.chat}
			{@const isActive = page.params.id === chat.user.id}
			{@const chatDraft = isActive && isEditingDraft(chat.user.id) ? '' : getDraft(chat.user.id)}
			{@const isTyping = typingStore.getUsersForChat(chat.id).length > 0}
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
				timestamp={chat.lastMessage?.createdAt ?? null}
				active={isActive}
				onclick={() => {
					list.markRead(chat.id);
					gotoKeepSearch(routes.chats.perschatUser(chat.user.id));
				}}
			/>
		{:else}
			{@const g = it.group}
			<GroupSidebarRow
				group={g}
				active={page.params.id === g.id}
				subtitle={g.lastMessage?.content || g.description || t.chat.groupChat}
			/>
		{/if}
	{/each}

	{#if !list.isSearching && list.loadingMore}
		<p class="body-xs text-faint loading-more">{t.common.loading}</p>
	{/if}

	{#if list.isSearching && list.items.length === 0 && list.filter !== 'groups'}
		{#if list.userSearch.searching}
			<div class="search-status body-xs text-faint">
				<Loader size={14} />
				<span>{t.common.searching}</span>
			</div>
		{:else if list.userSearch.error}
			<div class="search-status body-xs text-error">{list.userSearch.error}</div>
		{:else if list.userSearch.searched && list.userSearch.results.length === 0}
			<div class="search-status body-xs text-faint">{t.sidebar.noUsersFound}</div>
		{:else}
			{#each list.userSearch.results as user}
				<SidebarItem
					name={user.displayName ?? user.username}
					icon={User}
					avatarUrl={user.avatarUrl}
					subtitle={'#' + user.username}
					onclick={() => gotoKeepSearch(routes.chats.perschatUser(user.id))}
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
</style>
