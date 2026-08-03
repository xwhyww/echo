<script lang="ts">
	import { Volume2, Plus, FolderPlus, Settings } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import LoadState from '$lib/components/ui/LoadState.svelte';
	import VoiceChannelRow from '$lib/components/voice/VoiceChannelRow.svelte';
	import VoiceCategorySection from '$lib/components/voice/VoiceCategorySection.svelte';
	import VoiceChannelModals from '$lib/components/voice/VoiceChannelModals.svelte';
	import { useGroupVoiceChannels } from '$lib/hooks/voice/useGroupVoiceChannels.svelte.js';
	import { useVoiceChannelDialogs } from '$lib/hooks/voice/useVoiceChannelDialogs.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { VoiceChannel } from '$lib/api/voice.js';

	const t = $derived(i18n.t);

	const voice = useGroupVoiceChannels();
	const dialogs = useVoiceChannelDialogs(voice.closeMenu);
</script>

<header class="vp-header">
	<Volume2 size={14} />
	{#if voice.group}
		<span class="body-xl">{voice.group.name}</span>
	{/if}
	{#if voice.canManage}
		<a
			class="vp-settings-btn text-muted"
			href={voice.settingsHref}
			title={t.voice.settings.open}
			aria-label={t.voice.settings.open}
		>
			<Settings size={16} />
		</a>
	{/if}
</header>

<LoadState loading={voice.loading} error={voice.loadError}>
	{#if voice.isEmpty}
		<div class="vp-empty text-faint">
			<Volume2 size={32} />
			<p class="body-sm">{t.voice.noChannelsYet}</p>
			<p class="body-xs">
				{voice.canManage ? t.voice.clickNewChannel : t.voice.onlyOwnersAdmins}
			</p>
		</div>
	{:else}
		<div class="vp-content">
			{#if voice.uncategorized.length > 0}
				<ul class="vp-list">
					{#each voice.uncategorized as ch (ch.id)}
						{@render channelRow(ch)}
					{/each}
				</ul>
			{/if}

			{#each voice.visibleCategories as cat (cat.id)}
				{@const channels = voice.channelsIn(cat.id)}
				<VoiceCategorySection
					name={cat.name}
					count={channels.length}
					open={!voice.isCollapsed(cat.id)}
					canManage={voice.canManage}
					menuOpen={voice.isMenuOpen(cat.id)}
					ontoggle={() => voice.toggleCategory(cat.id)}
					onmenutoggle={() => voice.toggleMenu(cat.id)}
					onmenuclose={voice.closeMenu}
					onaddchannel={() => dialogs.openCreateChannel(cat.id)}
					onrename={() => dialogs.openRename(cat)}
					ondelete={() => voice.startDeleteCategory(cat)}
				>
					{#each channels as ch (ch.id)}
						{@render channelRow(ch)}
					{/each}
				</VoiceCategorySection>
			{/each}
		</div>
	{/if}
</LoadState>

{#if voice.canManage}
	<div class="vp-actions">
		<Button variant="secondary" onclick={dialogs.openCreateCategory}>
			<FolderPlus size={16} />
			<span>{t.voice.newCategory}</span>
		</Button>
		<Button variant="primary" onclick={() => dialogs.openCreateChannel(null)}>
			<Plus size={16} />
			<span>{t.voice.newChannel}</span>
		</Button>
	</div>
{/if}

{#snippet channelRow(ch: VoiceChannel)}
	<VoiceChannelRow
		channel={ch}
		current={voice.isCurrent(ch.id)}
		joining={voice.joiningId === ch.id}
		liveShareIds={voice.liveShareIds(ch.id)}
		canManage={voice.canManage}
		menuOpen={voice.isMenuOpen(ch.id)}
		onjoin={() => voice.join(ch)}
		onmenutoggle={() => voice.toggleMenu(ch.id)}
		onmenuclose={voice.closeMenu}
		onmove={() => dialogs.openMove(ch)}
		onaccess={() => dialogs.openAccess(ch)}
		ondelete={() => voice.startDeleteChannel(ch)}
	/>
{/snippet}

<VoiceChannelModals {voice} {dialogs} />

<style>
	.vp-header {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-3);
	}

	/* Sits at the far right without pulling the centred group name off-centre
	   any more than the leading icon already does. */
	.vp-settings-btn {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: var(--sp-1);
		border-radius: var(--radius-sm);
		flex-shrink: 0;
		transition:
			background var(--duration-fast) var(--ease-default),
			color var(--duration-fast) var(--ease-default);
	}

	.vp-settings-btn:hover {
		background: var(--c-bg-3);
		color: var(--c-text);
		text-decoration: none;
	}

	.vp-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-8);
		text-align: center;
	}

	.vp-empty p {
		margin: 0;
	}

	.vp-content {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.vp-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.vp-actions {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		width: 100%;
	}
</style>
