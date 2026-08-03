<script lang="ts">
	import {
		Volume2, Loader, Phone, Move, Lock, Trash2,
		MicOff, HeadphoneOff, ScreenShare,
	} from 'lucide-svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import DropdownMenu from '$lib/components/ui/DropdownMenu.svelte';
	import { MAX_AVATARS, participantLabel, sortedParticipants } from '$lib/utils/voiceChannels.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { VoiceChannel } from '$lib/api/voice.js';

	const t = $derived(i18n.t);

	// One voice channel: click anywhere on the row to join, with the people
	// already inside stacked on the right.
	interface Props {
		channel: VoiceChannel;
		/** True while *we* are connected to this one. */
		current: boolean;
		joining: boolean;
		/** Identities presenting right now, when the LiveKit client can see them. */
		liveShareIds: Set<string> | null;
		canManage: boolean;
		menuOpen: boolean;
		onjoin: () => void;
		onmenutoggle: () => void;
		onmenuclose: () => void;
		onmove: () => void;
		onaccess: () => void;
		ondelete: () => void;
	}

	let {
		channel,
		current,
		joining,
		liveShareIds,
		canManage,
		menuOpen,
		onjoin,
		onmenutoggle,
		onmenuclose,
		onmove,
		onaccess,
		ondelete,
	}: Props = $props();

	const people = $derived(sortedParticipants(channel));
</script>

<li class="vp-item" class:active={current}>
	<button class="vp-item-main body-sm text-default" onclick={onjoin} disabled={joining}>
		<span class="vp-icon text-muted"><Volume2 size={16} /></span>
		<span class="vp-name">{channel.name}</span>

		{#if people.length > 0}
			<span class="vp-people" title={t.voice.inCallCount(people.length)}>
				{#each people.slice(0, MAX_AVATARS) as p (p.userId)}
					{@const sharing = p.sharing || (liveShareIds?.has(p.userId) ?? false)}
					<span
						class="vp-person"
						class:muted={p.micMuted}
						title={participantLabel(p) + (p.micMuted ? ` ${t.voice.muted}` : '')}
					>
						<Avatar name={participantLabel(p)} avatarUrl={p.avatarUrl} size={22} />
						{#if sharing}
							<span class="vp-person-badge share text-faint"><ScreenShare size={9} /></span>
						{:else if p.deafened}
							<span class="vp-person-badge deaf text-faint"><HeadphoneOff size={9} /></span>
						{:else if p.micMuted}
							<span class="vp-person-badge mic text-faint"><MicOff size={9} /></span>
						{/if}
					</span>
				{/each}
				{#if people.length > MAX_AVATARS}
					<span class="vp-people-more body-xxs text-faint">+{people.length - MAX_AVATARS}</span>
				{/if}
			</span>
		{/if}

		{#if joining}
			<Loader size={14} />
		{:else if current}
			<span class="vp-badge body-xs text-accent">{t.voice.inCall}</span>
		{:else if people.length > 0}
			<span class="vp-count body-xs text-muted" title={t.voice.inCallCount(people.length)}>{people.length}</span>
		{:else}
			<Phone size={14} />
		{/if}
	</button>

	{#if canManage}
		<div class="vp-kebab-slot">
			<DropdownMenu
				open={menuOpen}
				ontoggle={onmenutoggle}
				onclose={onmenuclose}
				label={t.voice.channelOptions}
			>
				<button onclick={onmove}><Move size={14} /> {t.voice.moveTo}</button>
				<button onclick={onaccess}><Lock size={14} /> {t.voice.manageAccess}</button>
				<button class="danger" onclick={ondelete}>
					<Trash2 size={14} /> {t.voice.deleteChannel}
				</button>
			</DropdownMenu>
		</div>
	{/if}
</li>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.vp-item {
		display: flex;
		align-items: stretch;
		gap: 2px;
		border-radius: var(--radius-md);
		@include glass;
	}

	.vp-item-main {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-2);
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		border-radius: var(--radius-md) 0 0 var(--radius-md);
		transition: background var(--duration-fast) var(--ease-default);
	}

	.vp-item-main:disabled {
		opacity: 0.6;
		cursor: wait;
	}

	.vp-item.active .vp-item-main {
		background: var(--c-accent-subtle);
		color: var(--c-accent-text);
	}

	.vp-icon {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--c-bg-3);
	}

	.vp-item.active .vp-icon {
		background: var(--c-bg-3);
		color: var(--c-accent-text);
	}

	.vp-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vp-badge {
		flex-shrink: 0;
		padding: 1px 8px;
		border-radius: var(--radius-full);
		background: var(--c-bg-3);
	}

	.vp-count {
		flex-shrink: 0;
		padding: 1px 8px;
		border-radius: var(--radius-full);
		background: var(--c-bg-3);
		font-variant-numeric: tabular-nums;
	}

	/* ─── Live presence: overlapping avatar stack ─────────────────── */
	.vp-people {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		margin-left: var(--sp-1);
	}

	.vp-person {
		position: relative;
		display: inline-flex;
		margin-left: -6px;
		border-radius: 50%;
		/* Ring matches the row background so overlapping avatars read as
		   separate discs. */
		box-shadow: 0 0 0 2px var(--c-bg-2);
		transition: box-shadow var(--duration-fast) var(--ease-default);
	}

	.vp-person:first-child { margin-left: 0; }
	.vp-item.active .vp-person { box-shadow: 0 0 0 2px var(--c-bg-3); }
	.vp-person.muted { opacity: 0.55; }

	.vp-person-badge {
		position: absolute;
		right: -3px;
		bottom: -3px;
		width: 13px;
		height: 13px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--c-bg-3);
		box-shadow: 0 0 0 2px var(--c-bg-2);
	}

	.vp-person-badge.mic,
	.vp-person-badge.deaf {
		background: var(--c-error);
		color: var(--c-text-inverse);
	}

	.vp-person-badge.share {
		background: var(--c-accent);
		color: var(--c-text-inverse);
	}

	.vp-people-more {
		margin-left: var(--sp-1);
		font-variant-numeric: tabular-nums;
	}

	.vp-kebab-slot {
		display: flex;
		align-items: stretch;
		border-radius: 0 var(--radius-md) var(--radius-md) 0;
		overflow: visible;
	}

	.vp-kebab-slot :global(.menu-btn) {
		width: 40px;
		height: 100%;
		border-radius: 0 var(--radius-md) var(--radius-md) 0;
	}
</style>
