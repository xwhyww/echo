<script lang="ts">
	import { page } from '$app/state';
	import { isChatRoute, isVoiceChannelRoute } from '$lib/routes.js'
	import { pinnedBar } from '$lib/stores/pinnedBar.svelte.js';
	import AudioPlayerBar from '$lib/components/audio/AudioPlayerBar.svelte';
	import VoiceStatusBar from '$lib/components/voice/VoiceStatusBar.svelte';
	import PinnedMessagesBar from '$lib/components/chat/PinnedMessagesBar.svelte';

	// The floating bars used to position themselves individually against the
	// viewport, which put the player and the voice status bar in the exact same
	// bottom slot (and the player and the pinned bar in the same top slot on an
	// open chat). They're now children of two flex columns — one docked to each
	// edge — so anything visible simply stacks instead of overlapping.
	//
	// Each bar keeps its own visibility guard, so a hidden one contributes no box
	// and leaves no gap behind.

	// The open-chat screens have their own bottom composer, so the player docks
	// to the top there and to the bottom everywhere else. Derived here rather
	// than inside the player because the choice decides which stack it lands in.
	const dockTop = $derived(isChatRoute(page.route.id));
	const isVoiceChannelPage = $derived(isVoiceChannelRoute(page.route.id));

	const pinned = $derived(pinnedBar.current);
</script>

<div class="bar-stack {dockTop ? 'doc-top' : 'doc-bottom'}">
	{#if pinned && pinned.pinned.length > 0}
		<PinnedMessagesBar
			pinned={pinned.pinned}
			onjump={pinned.onjump}
			onunpin={pinned.onunpin}
		/>
	{/if}
	<AudioPlayerBar />
	{#if !isVoiceChannelPage}
		<VoiceStatusBar />
	{/if}
</div>

<style>
	.bar-stack {
		position: fixed;
		left: var(--sp-2);
		right: var(--sp-2);
		/* Deliberately no z-index: that would open a stacking context and trap
		   the pinned-list modal (--z-modal) inside it, below page-level toasts.
		   The bars carry their own z-index where they need one. */
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		/* The stack spans the viewport so its children can be full width, but it
		   must not swallow clicks in the empty space around them. */
		pointer-events: none;
	}

	.bar-stack > :global(*) {
		pointer-events: auto;
	}

	.doc-top {
		top: var(--header-h-padding-s);
	}
	
	.doc-bottom {
		bottom: var(--header-h-padding-l);
	}
</style>
