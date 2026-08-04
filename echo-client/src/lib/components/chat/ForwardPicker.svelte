<script lang="ts" module>
	import type { PersonalChat } from '$lib/api/personalChats.js';
	import type { GroupListItem } from '$lib/stores/groups.svelte.js';

	export type ForwardTarget =
		| { kind: 'chat'; chat: PersonalChat }
		| { kind: 'group'; group: GroupListItem };
</script>

<script lang="ts">
	import { auth } from '$lib/stores/auth.svelte.js';
	import { personalChatsService } from '$lib/api/personalChatsService.js';
	import { groupsStore } from '$lib/stores/groups.svelte.js';
	import { useGroups } from '$lib/hooks/groups/useGroups.svelte.js';
	import ForwardTargetRow from '$lib/components/chat/ForwardTargetRow.svelte';
	import LoadState from '$lib/components/ui/LoadState.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { Search, Users } from 'lucide-svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	useGroups();

	interface Props {
		onselect: (target: ForwardTarget) => void;
		onclose: () => void;
	}

	let { onselect, onclose }: Props = $props();

	let search = $state('');
	let inputEl = $state<HTMLInputElement>();
	let chatResults = $state<PersonalChat[]>([]);
	let loading = $state(true);
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		inputEl?.focus();
	});

	$effect(() => {
		const query = search.trim();
		loading = true;
		let cancelled = false;

		clearTimeout(debounceTimer);
		const delay = query ? 250 : 0;

		debounceTimer = setTimeout(() => {
			personalChatsService.getAll({ search: query || undefined })
				.then((res) => {
					if (cancelled) return;
					chatResults = res.chats.filter((c) => c.user.id !== auth.user?.id);
					loading = false;
				})
				.catch(() => {
					if (cancelled) return;
					chatResults = [];
					loading = false;
				});
		}, delay);

		return () => {
			cancelled = true;
			clearTimeout(debounceTimer);
		};
	});

	const groupResults = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return groupsStore.list;
		return groupsStore.list.filter((g) => g.name.toLowerCase().includes(q));
	});

	const isEmpty = $derived(chatResults.length === 0 && groupResults.length === 0);
</script>

<Modal title={t.chat.forwardTo} {onclose} maxWidth="400px">
	<div class="forward-search text-muted">
		<Search size={18} />
		<input
			bind:this={inputEl}
			bind:value={search}
			placeholder={t.chat.searchChatsGroups}
			class="search-input body-sm text-default"
		/>
	</div>

	<div class="forward-list">
		<LoadState {loading} empty={isEmpty ? t.chat.noChatsOrGroups : null}>
			{#if groupResults.length > 0}
<!--				<div class="section-label body-xs overline text-faint">{t.chat.groupsSection}</div>-->
				{#each groupResults as group (group.id)}
					<ForwardTargetRow
						name={group.name}
						avatarUrl={group.avatarUrl}
						onclick={() => onselect({ kind: 'group', group })}
					>
						{#snippet icon()}<Users size={20} />{/snippet}
					</ForwardTargetRow>
				{/each}
			{/if}
			{#if chatResults.length > 0}
<!--				<div class="section-label body-xs overline text-faint">{t.chat.directMessages}</div>-->
				{#each chatResults as chat (chat.id)}
					<ForwardTargetRow
						name={chat.user.displayName ?? chat.user.username}
						avatarUrl={chat.user.avatarUrl}
						onclick={() => onselect({ kind: 'chat', chat })}
					/>
				{/each}
			{/if}
		</LoadState>
	</div>
</Modal>

<style>
	/* The search bar spans the card, so it cancels the modal's own padding —
	 * its two rules are separators, and a separator that stops short of the
	 * edges reads as a box. */
	.forward-search {
		display: flex;
		align-items: center;
		margin: 0 calc(-1 * var(--sp-3));
		padding: 0 var(--sp-2);
		border-top: 1px solid var(--c-border);
		border-bottom: 1px solid var(--c-border);
	}

	.search-input {
		flex: 1;
		background: none;
		border: none;
		outline: none;
	}

	.search-input::placeholder {
		color: var(--c-text-faint);
	}

	.forward-list {
		flex: 1;
		max-height: 360px;
		overflow-y: auto;
	}

	.section-label {
		padding: 0;
	}
</style>
