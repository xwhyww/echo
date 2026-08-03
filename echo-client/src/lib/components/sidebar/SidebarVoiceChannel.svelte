<script lang="ts">
	import { Volume2, Loader, Phone } from 'lucide-svelte';
	import SidebarVoiceParticipant from '$lib/components/sidebar/SidebarVoiceParticipant.svelte';
	import { sortedParticipants } from '$lib/utils/voiceChannels.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { VoiceChannel, VoiceChannelParticipant } from '$lib/api/voice.js';

	const t = $derived(i18n.t);

	// A channel as it appears in the sidebar accordion: the join button, then
	// whoever is already inside.
	interface Props {
		channel: VoiceChannel;
		/** We are connected to this channel right now. */
		current?: boolean;
		joining?: boolean;
		/** Identities LiveKit reports presenting; null when we aren't in this channel. */
		liveShareIds?: Set<string> | null;
		onjoin: (channel: VoiceChannel) => void;
		onparticipantmenu: (x: number, y: number, participant: VoiceChannelParticipant) => void;
	}

	let {
		channel,
		current = false,
		joining = false,
		liveShareIds = null,
		onjoin,
		onparticipantmenu,
	}: Props = $props();

	const participants = $derived(sortedParticipants(channel));

	function handleJoin(e: MouseEvent) {
		e.stopPropagation();
		onjoin(channel);
	}
</script>

<div class="g-channel-block">
	<button class="g-channel body-xs text-muted" class:active={current} onclick={handleJoin} disabled={joining}>
		<Volume2 size={12} />
		<span class="g-channel-name truncate">{channel.name}</span>
		{#if joining}
			<Loader size={10} />
		{:else if current}
			<span class="g-channel-badge body-xxs text-accent">{t.sidebar.inCall}</span>
		{:else if participants.length > 0}
			<span class="g-channel-count body-xxs text-faint">{participants.length}</span>
		{:else}
			<Phone size={10} class="g-channel-phone" />
		{/if}
	</button>

	{#if participants.length > 0}
		<ul class="g-channel-people">
			{#each participants as p (p.userId)}
				<SidebarVoiceParticipant
					participant={p}
					sharing={liveShareIds?.has(p.userId) ?? false}
					onmenu={onparticipantmenu}
				/>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.g-channel-block {
		display: flex;
		flex-direction: column;
	}

	.g-channel {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2);
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		text-align: left;
		transition:
			background var(--duration-fast) var(--ease-default),
			color var(--duration-fast) var(--ease-default);
	}

	.g-channel:disabled {
		opacity: 0.6;
		cursor: wait;
	}

	.g-channel.active {
		background: var(--c-accent-subtle);
		color: var(--c-accent-text);
	}

	.g-channel-name {
		flex: 1;
	}

	.g-channel-badge,
	.g-channel-count {
		padding: 1px 6px;
		border-radius: var(--radius-full);
		background: var(--c-bg-3);
	}

	.g-channel.active .g-channel-count {
		color: var(--c-accent-text);
	}

	/* Revealed with the row so an empty channel still says "you can call here". */
	.g-channel :global(.g-channel-phone) {
		opacity: 0;
		transition: opacity var(--duration-fast) var(--ease-default);
	}

	.g-channel-people {
		list-style: none;
		margin: 0;
		padding: var(--sp-1) 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
</style>
