<script lang="ts">
	import { ChevronRight, ChevronDown, Loader, Settings } from 'lucide-svelte';
	import SidebarVoiceChannel from '$lib/components/sidebar/SidebarVoiceChannel.svelte';
	import VoiceUserVolumePopup from '$lib/components/voice/VoiceUserVolumePopup.svelte';
	import { auth } from '$lib/stores/auth.svelte.js';
	import { participantLabel } from '$lib/utils/voiceChannels.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { useSidebarVoiceChannels } from '$lib/hooks/voice/useSidebarVoiceChannels.svelte.js';
	import type { VoiceChannel, VoiceChannelParticipant } from '$lib/api/voice.js';

	const t = $derived(i18n.t);

	// The panel that drops out of a group row: its voice channels, grouped by
	// category, with everyone currently in them.
	interface Props {
		voice: ReturnType<typeof useSidebarVoiceChannels>;
	}

	let { voice }: Props = $props();

	// Only one popup is ever open, and it is positioned at the pointer rather
	// than anchored to the row, so its coordinates live with it.
	let volumeMenu = $state<{
		x: number;
		y: number;
		identity: string;
		name: string;
		isLocal: boolean;
	} | null>(null);

	function openVolumeMenu(x: number, y: number, p: VoiceChannelParticipant) {
		volumeMenu = {
			x,
			y,
			identity: p.userId,
			name: participantLabel(p),
			isLocal: auth.user?.id === p.userId,
		};
	}
</script>

<div class="g-accordion">
	<button class="g-manage body-xs fw-medium text-muted" type="button" onclick={voice.openManagePage}>
		<Settings size={12} />
		<span>{t.sidebar.manageChannels}</span>
	</button>

	{#if voice.loading}
		<div class="g-accordion-hint body-xs text-faint">
			<Loader size={12} />
			<span>{t.common.loading}</span>
		</div>
	{:else if voice.loadError}
		<p class="g-accordion-hint body-xs text-error">{voice.loadError}</p>
	{:else if voice.isEmpty}
		<p class="g-accordion-hint body-xs text-faint">{t.sidebar.noVoiceChannels}</p>
	{:else}
		{#each voice.uncategorized as ch (ch.id)}
			{@render channel(ch)}
		{/each}

		{#each voice.categories as cat (cat.id)}
			{@const open = !voice.isCollapsed(cat.id)}
			{@const catChannels = voice.channelsIn(cat.id)}
			<div class="g-cat">
				<button
					class="g-cat-toggle body-xxs overline fw-semibold text-faint"
					onclick={(e) => {
						e.stopPropagation();
						voice.toggleCategory(cat.id);
					}}
					aria-expanded={open}
				>
					{#if open}
						<ChevronDown size={11} />
					{:else}
						<ChevronRight size={11} />
					{/if}
					<span class="g-cat-name body-xs truncate">{cat.name}</span>
				</button>
				{#if open}
					{#if catChannels.length === 0}
						<p class="g-cat-empty body-xs text-faint">{t.sidebar.emptyChannel}</p>
					{:else}
						<div class="g-cat-children">
							{#each catChannels as ch (ch.id)}
								{@render channel(ch)}
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		{/each}
	{/if}
</div>

{#if volumeMenu}
	<VoiceUserVolumePopup
		x={volumeMenu.x}
		y={volumeMenu.y}
		identity={volumeMenu.identity}
		name={volumeMenu.name}
		isLocal={volumeMenu.isLocal}
		onclose={() => (volumeMenu = null)}
	/>
{/if}

{#snippet channel(ch: VoiceChannel)}
	<SidebarVoiceChannel
		channel={ch}
		current={voice.isCurrent(ch.id)}
		joining={voice.joiningId === ch.id}
		liveShareIds={voice.liveShareIds(ch.id)}
		onjoin={voice.join}
		onparticipantmenu={openVolumeMenu}
	/>
{/snippet}

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.g-accordion {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: var(--sp-2);
		margin: var(--sp-1) var(--sp-2) 0;
		border-radius: var(--radius-md);

		@include glass;
	}

	.g-manage {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		width: 100%;
		padding: var(--sp-2);
		margin-bottom: var(--sp-1);
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		text-align: left;
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-default),
			color var(--duration-fast) var(--ease-default);
	}

	.g-accordion-hint {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		padding: var(--sp-1) var(--sp-2);
		margin: 0;
	}

	.g-cat {
		display: flex;
		flex-direction: column;
		gap: 1px;
		margin-top: var(--sp-1);
	}

	.g-cat-toggle {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		padding: var(--sp-1) var(--sp-2);
		background: none;
		border: none;
		cursor: pointer;
		border-radius: var(--radius-sm);
		text-align: left;
		transition: color var(--duration-fast) var(--ease-default);
	}

	.g-cat-name {
		flex: 1;
	}

	.g-cat-empty {
		padding: var(--sp-1) var(--sp-2) var(--sp-1) var(--sp-5);
		margin: 0;
	}

	.g-cat-children {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding-left: var(--sp-3);
	}
</style>
