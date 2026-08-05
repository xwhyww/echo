<script lang="ts">
	import { ArrowLeft, Volume2 } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ConnectionQualityIndicator from '$lib/components/voice/ConnectionQualityIndicator.svelte';
	import VoiceControlBar from '$lib/components/voice/VoiceControlBar.svelte';
	import VoiceParticipantTile from '$lib/components/voice/VoiceParticipantTile.svelte';
	import VoiceScreenTile from '$lib/components/voice/VoiceScreenTile.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { useVoiceChannelPage } from '$lib/hooks/voice/useVoiceChannelPage.svelte.js';
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import { routes } from '$lib/routes.js'
	import { page } from '$app/state'

	const t = $derived(i18n.t);

	// The channel itself: who is here, whose screen is up, and the controls.
	// Swapped out for the channel chat when the user opens it.
	interface Props {
		voice: ReturnType<typeof useVoiceChannelPage>;
	}
	
	const voiceId = $derived(page.params.id!);

	let { voice }: Props = $props();
</script>

<div class="vc-page">
	<div class="vc-header">
		<BackButton backHref={routes.chats.groupVoice(voiceId)} size={48}/>
		{#if voice.showQuality}
			<ConnectionQualityIndicator />
		{/if}
	</div>

	{#if voice.error}
		<div class="vc-status text-error">
			<p>{voice.error}</p>
			<Button variant="secondary" onclick={voice.retry}>{t.common.retry}</Button>
		</div>
	{:else if voice.connecting}
		<div class="vc-status">
			<div class="vc-icon-big text-inverse">
				<Volume2 size={28} />
			</div>
			<p class="body-md">{t.voice.connecting}</p>
		</div>
	{:else if voice.connected}
		{#if voice.focusedShare}
			<div class="vc-screens">
				<VoiceScreenTile share={voice.focusedShare} onback={voice.unfocusShare} />
			</div>
		{:else}
			<div class="vc-grid" style="--tile-size: {voice.tileSize}px">
				{#each voice.participants as p (p.identity)}
					<VoiceParticipantTile
						participant={p}
						share={voice.shareFor(p.identity)}
						size={voice.tileSize}
						onwatch={voice.watchShare}
						onmenu={voice.openVolumeMenu}
					/>
				{/each}
			</div>
		{/if}

		<VoiceControlBar
			chatOpen={voice.chatOpen}
			ontogglechat={voice.toggleChat}
			onshare={voice.openSharePopup}
			onleave={voice.leave}
		/>
	{:else}
		<div class="vc-status">
			<p class="body-sm text-faint">{t.voice.notConnected}</p>
		</div>
	{/if}
</div>

<style>
	.vc-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		flex: 1;
		min-width: 0;
		padding: var(--sp-2);
		padding-top: var(--safe-top);
		padding-bottom: var(--safe-bottom);
		
		gap: var(--sp-6);
	}

	.vc-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
	}

	.back-btn {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-1) 0;
		background: none;
		border: none;
		cursor: pointer;
		transition: color var(--duration-fast) var(--ease-default);
	}

	/* Fills the space the grid would have taken, so connecting, failing and
	   sitting alone all centre the same way. */
	.vc-status {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--sp-3);
		flex: 1;
	}

	.vc-icon-big {
		width: 64px;
		height: 64px;
		border-radius: var(--radius-lg);
		background: var(--c-accent);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.vc-screens {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: var(--sp-3);
		flex: 1 1 auto;
		min-height: 0;
	}

	.vc-grid {
		display: grid;
		grid-template-columns: repeat(
			auto-fit,
			minmax(min(100%, var(--tile-size, 120px)), 1fr)
		);
		gap: var(--sp-2);
		flex: 1;
		align-content: start;
		justify-items: center;
	}
</style>
