<script lang="ts">
	import { Shield, ShieldOff, UserMinus, Crown } from 'lucide-svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import DropdownMenu from '$lib/components/ui/DropdownMenu.svelte';
	import { memberDisplayName } from '$lib/utils/members.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { GroupMember } from '$lib/api/groups.js';

	const t = $derived(i18n.t);

	// One member of a group, with whatever moderation the viewer is entitled to.
	interface Props {
		member: GroupMember;
		/** Marks the viewer's own row, which never gets a menu. */
		isSelf: boolean;
		/** Whether the viewer may act on *this* member at all. */
		canAct: boolean;
		/** Only the owner may promote, demote and hand the group over. */
		isOwner: boolean;
		menuOpen: boolean;
		onmenutoggle: () => void;
		onmenuclose: () => void;
		onchangerole: (role: 'admin' | 'member') => void;
		ontransfer: () => void;
		onremove: () => void;
	}

	let {
		member,
		isSelf,
		canAct,
		isOwner,
		menuOpen,
		onmenutoggle,
		onmenuclose,
		onchangerole,
		ontransfer,
		onremove,
	}: Props = $props();

	const name = $derived(memberDisplayName(member));
</script>

<li class="member">
	<Avatar {name} avatarUrl={member.avatarUrl} size={40} />
	<div class="member-meta">
		<div class="body-sm fw-medium">
			{name}
			{#if isSelf}<span class="body-sm text-faint">{t.groupSettings.you}</span>{/if}
		</div>
		<div class="member-sub body-xs text-faint">@{member.username}</div>
	</div>

	{#if member.role !== 'member'}
		<span class="member-badge body-xs badge-{member.role} text-muted">{t.groupsPage.roles[member.role]}</span>
	{/if}

	{#if canAct}
		<DropdownMenu
			open={menuOpen}
			ontoggle={onmenutoggle}
			onclose={onmenuclose}
			label={t.groupSettings.memberActions}
		>
			{#if member.role === 'member'}
				<button onclick={() => onchangerole('admin')}>
					<Shield size={16} /> {t.groupSettings.makeAdmin}
				</button>
			{:else if member.role === 'admin' && isOwner}
				<button onclick={() => onchangerole('member')}>
					<ShieldOff size={16} /> {t.groupSettings.demote}
				</button>
			{/if}
			{#if isOwner}
				<button onclick={ontransfer}>
					<Crown size={16} /> {t.groupSettings.transferOwnership}
				</button>
			{/if}
			<button class="danger" onclick={onremove}>
				<UserMinus size={16} /> {t.groupSettings.remove}
			</button>
		</DropdownMenu>
	{/if}
</li>

<style>
	.member {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-2) var(--sp-3);
		background: var(--c-bg-3);
		border-radius: var(--radius-md);
	}

	.member-meta {
		flex: 1;
		min-width: 0;
	}

	.member-sub {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.member-badge {
		flex-shrink: 0;
		padding: 2px 8px;
		border-radius: var(--radius-full);
		background: var(--c-bg-3);
		text-transform: capitalize;
	}

	.badge-owner { background: var(--c-accent); color: var(--c-text-inverse); }
	.badge-admin { background: var(--c-accent-subtle); color: var(--c-accent-text); }
</style>
