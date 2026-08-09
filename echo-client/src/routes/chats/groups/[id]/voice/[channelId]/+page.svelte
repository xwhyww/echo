<script lang="ts">
	import ScreenSharePopup from '$lib/components/voice/ScreenSharePopup.svelte';
	import VoiceChannelStage from '$lib/components/voice/VoiceChannelStage.svelte';
	import VoiceUserVolumePopup from '$lib/components/voice/VoiceUserVolumePopup.svelte';
	import { useVoiceChannelPage } from '$lib/hooks/voice/useVoiceChannelPage.svelte.js';

	const voice = useVoiceChannelPage();
</script>

<!-- Not a PageColumn: this screen fills the viewport and manages its own
     scrolling panes rather than stacking sections down a column. -->
<div class="vc-shell">
	<VoiceChannelStage {voice} />
</div>

{#if voice.volumeMenu}
	<VoiceUserVolumePopup
		x={voice.volumeMenu.x}
		y={voice.volumeMenu.y}
		identity={voice.volumeMenu.identity}
		name={voice.volumeMenu.name}
		isLocal={voice.volumeMenu.isLocal}
		onclose={voice.closeVolumeMenu}
	/>
{/if}

{#if voice.sharePopupOpen}
	<ScreenSharePopup onclose={voice.closeSharePopup} />
{/if}

<style>
	.vc-shell {
		display: flex;
		flex-direction: row;
		height: 100%;
		width: 100%;
		min-height: 0;
	}
</style>
