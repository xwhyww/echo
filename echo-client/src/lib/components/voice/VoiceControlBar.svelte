<script lang="ts">
	import {
		Mic,
		MicOff,
		Headphones,
		HeadphoneOff,
		PhoneOff,
		MessageSquare,
		ScreenShare,
		ScreenShareOff,
	} from 'lucide-svelte';
	import { voiceClient } from '$lib/stores/voiceClient.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// The bar along the bottom of a voice channel. Mic, deafen and screen share
	// read their state straight off the client; chat and leave belong to the page.
	interface Props {
		/** Navigates to the channel's chat — a screen, not a pane beside this one. */
		onopenchat: () => void;
		onshare: () => void;
		onleave: () => void;
	}

	let { onopenchat, onshare, onleave }: Props = $props();
</script>

<div class="vc-controls">
	<button
		type="button"
		class="vc-ctrl text-muted"
		class:active={voiceClient.isMuted}
		onclick={() => voiceClient.toggleMuted()}
		title={voiceClient.isMuted ? t.call.unmute : t.call.mute}
		aria-label={voiceClient.isMuted ? t.call.unmute : t.call.mute}
	>
		{#if voiceClient.isMuted}
			<MicOff size={20} />
		{:else}
			<Mic size={20} />
		{/if}
	</button>

	<button
		type="button"
		class="vc-ctrl text-muted"
		class:active={voiceClient.isDeafened}
		onclick={() => voiceClient.toggleDeafened()}
		title={voiceClient.isDeafened ? t.voice.undeafen : t.voice.deafen}
		aria-label={voiceClient.isDeafened ? t.voice.undeafen : t.voice.deafen}
	>
		{#if voiceClient.isDeafened}
			<HeadphoneOff size={20} />
		{:else}
			<Headphones size={20} />
		{/if}
	</button>

	{#if voiceClient.canShare}
		<button
			type="button"
			class="vc-ctrl text-muted"
			class:active={voiceClient.isScreenSharing}
			onclick={onshare}
			title={voiceClient.isScreenSharing ? t.voice.sharingClickToManage : t.voice.shareScreen}
			aria-label={t.voice.shareScreen}
		>
			{#if voiceClient.isScreenSharing}
				<ScreenShareOff size={20} />
			{:else}
				<ScreenShare size={20} />
			{/if}
		</button>
	{/if}

	<button type="button" class="vc-ctrl vc-leave text-inverse" onclick={onleave} title={t.voice.disconnect} aria-label={t.voice.disconnect}>
		<PhoneOff size={20} />
	</button>

	<!-- Not a toggle any more: the chat is somewhere you go, and the way back is
	     the header's arrow like on every other chat screen. -->
	<button
		type="button"
		class="vc-ctrl text-muted"
		onclick={onopenchat}
		title={t.voice.openChat}
		aria-label={t.voice.openChannelChat}
	>
		<MessageSquare size={20} />
	</button>
</div>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;
	@use '$lib/styles/layout.mixin' as *;

	.vc-controls {
		position: relative;
		display: flex;
		justify-content: space-between;
		border-top: 1px solid var(--c-border);
		padding: var(--sp-2);
		border-radius: var(--radius-full);

		@include glass;
	}

	.vc-ctrl {
		width: 48px;
		height: 48px;
		border-radius: var(--radius-full);
		border: none;
		background: var(--c-bg-3);
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-default),
			color var(--duration-fast) var(--ease-default);

		@include flex-center;
	}

	.vc-ctrl.active {
		background: var(--c-accent-subtle-2);
		color: var(--c-accent-text);
	}

	.vc-leave {
		background: var(--c-error);
	}
</style>
