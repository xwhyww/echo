<script lang="ts">
	import SidebarItem from '$lib/components/sidebar/SidebarItem.svelte';
	import { Search, User, Loader } from 'lucide-svelte';
	import type { User as UserType } from '$lib/api/auth.js';
	import { useUserSearch } from '$lib/hooks/user/useUserSearch.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		onselect?: (user: UserType) => void;
	}

	let { onselect }: Props = $props();

	const search = useUserSearch();

	let inputEl = $state<HTMLInputElement>();
</script>

<div class="user-search">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="search-input text-muted" onclick={() => inputEl?.focus()}>
		<Search size={16} />
		<input
			class="body-sm"
			bind:this={inputEl}
			type="text"
			placeholder={t.userSearch.placeholder}
			bind:value={search.query}
			oninput={search.handleInput}
		/>
	</div>

	{#if search.searching}
		<div class="search-status body-xs text-faint">
			<Loader size={16} />
			<span>{t.common.searching}</span>
		</div>
	{:else if search.error}
		<div class="search-status error body-xs text-faint">{search.error}</div>
	{:else if search.searched && search.results.length === 0}
		<div class="search-status body-xs text-faint">{t.userSearch.noUsersFound}</div>
	{:else if search.results.length > 0}
		<div class="search-results">
			{#each search.results as user}
				<SidebarItem
					name={user.displayName ?? user.username}
					icon={User}
					subtitle={'@' + user.username}
					onclick={() => onselect?.(user)}
				/>
			{/each}
		</div>
	{:else}
		<div class="empty-hint body-xs lh-relaxed text-faint">
			<p>{t.userSearch.findPeople}</p>
			<p>{t.userSearch.typeAbove}</p>
		</div>
	{/if}
</div>

<style>
	.user-search {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding: 0 var(--sp-2);
	}

	.search-input {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		background: var(--c-bg-3);
		border: 1px solid var(--c-border);
		border-radius: var(--radius-md);
		padding: var(--sp-2) var(--sp-3);
		cursor: text;
	}

	.search-input input {
		flex: 1;
		background: none;
		border: none;
		outline: none;
		color: var(--c-text);
		padding: 0;
		height: auto;
	}

	.search-input input::placeholder {
		color: var(--c-text-faint);
	}

	.search-input:focus-within {
		border-color: var(--c-accent-solid);
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

	.search-results {
		display: flex;
		flex-direction: column;
	}

	.empty-hint {
		padding: var(--sp-3) var(--sp-4);
	}
</style>
