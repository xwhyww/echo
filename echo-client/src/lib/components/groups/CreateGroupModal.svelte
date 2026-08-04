<script lang="ts">
	import { Search, Users } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Chip from '$lib/components/ui/Chip.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import Loading from '$lib/components/ui/Loading.svelte';
	import UserPickRow from '$lib/components/user/UserPickRow.svelte';
	import { useCreateGroup } from '$lib/hooks/groups/useCreateGroup.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		onclose: () => void;
	}

	let { onclose }: Props = $props();

	// Wrapped rather than passed straight through, so the hook calls whatever
	// `onclose` is at the time, not whatever it was at mount.
	const form = useCreateGroup(() => onclose());

	function label(u: { displayName: string | null; username: string }) {
		return u.displayName ?? u.username;
	}

	function close() {
		if (!form.creating) onclose();
	}
</script>

<Modal
	title={t.groupsPage.modalTitle}
	onclose={close}
	closeDisabled={form.creating}
	maxWidth="520px"
>
	{#snippet icon()}<Users size={22} />{/snippet}

	<Field label={t.groupsPage.name}>
		<Input bind:value={form.name} placeholder={t.groupsPage.namePlaceholder} autofocus />
	</Field>

	<Field label={t.groupsPage.description} note={t.common.optional}>
		<Input bind:value={form.description} placeholder={t.groupsPage.descriptionPlaceholder} />
	</Field>

	<!-- Not a `Field`: the results list under the control can't live inside a
	     <label>, and `Field` without `for` is one. -->
	<div class="field">
		<span class="body-xs text-muted">{t.groupsPage.addPeople}</span>
		<Input
			bind:value={form.query}
			oninput={form.onQueryInput}
			placeholder={t.groupsPage.searchPlaceholder}
		>
			{#snippet icon()}<Search size={16} />{/snippet}
		</Input>

		{#if form.selected.length > 0}
			<div class="chips">
				{#each form.selected as u (u.id)}
					<Chip title={label(u)} onremove={() => form.deselect(u.id)}>
						{#snippet leading()}
							<Avatar name={label(u)} avatarUrl={u.avatarUrl} size={20} />
						{/snippet}
						{label(u)}
					</Chip>
				{/each}
			</div>
		{/if}

		<div class="picker">
			{#if form.friendsLoading}
				<Loading>{t.groupsPage.loadingFriends}</Loading>
			{:else}
				{#if form.visibleFriends.length === 0 && !form.searchActive}
					<p class="hint body-sm text-faint">
						{form.hasFriends ? t.groupsPage.noMatches : t.groupsPage.noFriendsYet}
					</p>
				{/if}

				{#if form.visibleFriends.length > 0}
					<div class="picker-section">
						<div class="body-xs overline text-muted picker-title">{t.groupsPage.friendsSection}</div>
						{#each form.visibleFriends as u (u.id)}
							<UserPickRow
								name={label(u)}
								username={u.username}
								avatarUrl={u.avatarUrl}
								checked={form.isSelected(u.id)}
								onclick={() => form.toggle(u)}
							/>
						{/each}
					</div>
				{/if}

				{#if form.searchActive}
					<div class="picker-section">
						<div class="body-xs overline text-muted picker-title">
							{t.groupsPage.otherUsers}
							{#if form.searching}<span class="text-faint"> · {t.groupsPage.searching}</span>{/if}
						</div>
						{#if !form.searching && form.otherUsers.length === 0}
							<p class="hint body-sm text-faint">{t.groupsPage.noUsersFound}</p>
						{/if}
						{#each form.otherUsers as u (u.id)}
							<UserPickRow
								name={label(u)}
								username={u.username}
								avatarUrl={u.avatarUrl}
								checked={form.isSelected(u.id)}
								onclick={() => form.toggle(u)}
							/>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	</div>

	{#snippet actions()}
		<Button variant="ghost" onclick={close} disabled={form.creating}>{t.common.cancel}</Button>
		<Button variant="primary" onclick={form.submit} disabled={form.creating || !form.name.trim()}>
			{form.creating
				? t.groupsPage.creating
				: form.selected.length > 0
					? t.groupsPage.createAndInvite(form.selected.length)
					: t.groupsPage.createAction}
		</Button>
	{/snippet}
</Modal>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.picker {
		min-height: 200px;
		max-height: 320px;
		overflow-y: auto;
		background: var(--c-bg-1, var(--c-bg-2));
		border: 1px solid var(--c-border);
		border-radius: var(--radius-md);
		padding: var(--sp-2);
	}

	.picker-section + .picker-section {
		margin-top: var(--sp-3);
	}

	.picker-title {
		padding: 4px var(--sp-2);
	}

	.hint {
		padding: var(--sp-3);
		text-align: center;
		margin: 0;
	}
</style>
