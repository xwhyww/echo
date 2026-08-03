<script lang="ts">
	import { Search, UserPlus } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import Loading from '$lib/components/ui/Loading.svelte';
	import { useGroupInvite } from '$lib/hooks/groups/useGroupInvite.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		groupId: string;
		/** Who's already in — filtered out of both candidate lists. */
		memberIds: Set<string>;
		onclose: () => void;
	}

	let { groupId, memberIds, onclose }: Props = $props();

	const invite = useGroupInvite(() => groupId, () => memberIds);

	function label(u: { displayName: string | null; username: string }) {
		return u.displayName ?? u.username;
	}
</script>

<Modal title={t.groupSettings.invitePeople} {onclose} maxWidth="520px">
	{#snippet icon()}<UserPlus size={22} />{/snippet}

	<Input
		bind:value={invite.query}
		oninput={invite.onQueryInput}
		placeholder={t.groupSettings.inviteSearchPlaceholder}
	>
		{#snippet icon()}<Search size={14} />{/snippet}
	</Input>

	{#if !invite.searchActive && !invite.friendsLoading && invite.friendsAvailable.length > 0}
		<p class="section body-xs overline text-muted">{t.groupSettings.yourFriends}</p>
	{/if}

	{#if invite.friendsLoading && !invite.searchActive}
		<Loading>{t.groupSettings.loadingFriends}</Loading>
	{:else if invite.candidates.length === 0}
		<p class="body-sm text-faint">
			{#if !invite.searchActive}
				{invite.hasFriends ? t.groupSettings.allAreMembers : t.groupSettings.noFriendsYet}
			{:else if invite.searching}
				{t.common.searching}
			{:else if invite.searched}
				{t.groupsPage.noUsersFound}
			{:else}
				{t.groupSettings.keepTyping}
			{/if}
		</p>
	{:else}
		<ul class="invite-list">
			{#each invite.candidates as u (u.id)}
				<li class="invite-row">
					<Avatar name={label(u)} avatarUrl={u.avatarUrl} size={32} />
					<div class="invite-meta">
						<div class="body-sm fw-medium">
							{label(u)}
							{#if invite.isFriend(u.id)}
								<span class="invite-tag body-xxs overline text-accent">{t.groupsPage.friendsSection}</span>
							{/if}
						</div>
						<div class="invite-sub body-xs text-faint">@{u.username}</div>
					</div>
					<Button
						variant={invite.isInvited(u.id) ? 'ghost' : 'primary'}
						disabled={invite.isInviting(u.id) || invite.isInvited(u.id)}
						onclick={() => invite.invite(u.id)}
					>
						{invite.isInvited(u.id)
							? t.groupSettings.invited
							: invite.isInviting(u.id)
								? '...'
								: t.groupSettings.invite}
					</Button>
				</li>
			{/each}
		</ul>
	{/if}

	{#snippet actions()}
		<Button variant="ghost" onclick={onclose}>{t.common.close}</Button>
	{/snippet}
</Modal>

<style>
	.section,
	p {
		margin: 0;
	}

	.invite-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		max-height: 320px;
		overflow-y: auto;
	}

	.invite-row {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-2) var(--sp-3);
		background: var(--c-bg-3);
		border-radius: var(--radius-md);
	}

	.invite-meta {
		flex: 1;
		min-width: 0;
	}

	.invite-sub {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.invite-tag {
		padding: 1px 6px;
		margin-left: 6px;
		border-radius: var(--radius-full);
		background: var(--c-accent-subtle);
	}
</style>
