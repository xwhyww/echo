<script lang="ts">
	import { Plus, UserPlus } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import Loading from '$lib/components/ui/Loading.svelte';
	import { voiceService } from '$lib/api/voiceService.js';
	import { toasts } from '$lib/stores/toasts.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import { filterMembers } from '$lib/utils/voiceRoles.js';
	import type { VoiceRole } from '$lib/api/voice.js';
	import type { GroupMember } from '$lib/api/groups.js';

	const t = $derived(i18n.t);

	interface Props {
		role: VoiceRole;
		/**
		 * The group's roster. Owned by the caller rather than fetched here: it is
		 * cached across opens, so re-opening the picker doesn't blank a list we
		 * could already render.
		 */
		members: GroupMember[];
		loading: boolean;
		onclose: () => void;
		/** Fires once the membership is stored, so the role list can update. */
		onadded: (member: GroupMember) => void;
	}

	let { role, members, loading, onclose, onadded }: Props = $props();

	let query = $state('');
	// Users with an in-flight add, so their row can't be clicked twice.
	let addingUserIds = $state<Set<string>>(new Set());

	const available = $derived(
		filterMembers(members, new Set(role.members.map((m) => m.userId)), query),
	);

	async function add(m: GroupMember) {
		// The row stays in the list until the caller's update lands, so without
		// this a double-click would POST twice.
		if (addingUserIds.has(m.userId)) return;
		addingUserIds = new Set(addingUserIds).add(m.userId);
		try {
			await voiceService.addRoleMember(role.id, m.userId);
			onadded(m);
		} catch (err) {
			console.error('[RoleMemberPickerModal] add failed', err);
			toasts.error((err as Error).message ?? t.voice.roles.addMemberFailed);
		} finally {
			const next = new Set(addingUserIds);
			next.delete(m.userId);
			addingUserIds = next;
		}
	}
</script>

<Modal title={t.voice.roles.addToRole(role.name)} {onclose}>
	{#snippet icon()}<UserPlus size={22} />{/snippet}
	<Field label={t.voice.roles.searchMembers}>
		<Input
			bind:value={query}
			placeholder={t.voice.roles.memberSearchPlaceholder}
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
		/>
	</Field>
	{#if loading}
		<Loading>{t.voice.roles.loadingMembers}</Loading>
	{:else if available.length === 0}
		<p class="empty body-sm text-muted">{t.voice.roles.noMatchingMembers}</p>
	{:else}
		<ul class="picker">
			{#each available as m (m.userId)}
				<li>
					<button
						class="picker-row text-default"
						onclick={() => add(m)}
						disabled={addingUserIds.has(m.userId)}
					>
						<Avatar name={m.displayName ?? m.username} avatarUrl={m.avatarUrl} size={24} />
						<div class="picker-info">
							<span class="picker-name body-sm">{m.displayName ?? m.username}</span>
							<span class="picker-sub body-xs text-faint">@{m.username}</span>
						</div>
						<Plus size={16} />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	{#snippet actions()}
		<Button variant="ghost" onclick={onclose}>{t.common.close}</Button>
	{/snippet}
</Modal>

<style>
	.empty {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		margin: 0;
	}

	.picker {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 280px;
		overflow-y: auto;
	}

	.picker-row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2);
		background: var(--c-bg-3);
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		text-align: left;
		transition: background var(--duration-fast) var(--ease-default);
	}

	.picker-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.picker-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
