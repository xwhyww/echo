<script lang="ts">
	import AppleEmoji from '$lib/components/emoji/AppleEmoji.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// Someone reacted to a message that's scrolled out of view. Sits below the
	// scroll-to-bottom button, or takes its place when that one is hidden.
	interface Props {
		emoji: string;
		/** True while the scroll-to-bottom button is also showing. */
		stacked: boolean;
		onclick: () => void;
	}

	let { emoji, stacked, onclick }: Props = $props();
</script>

<button class="jump-to-reaction" class:stacked {onclick} title={t.chat.jumpToReaction}>
	<AppleEmoji {emoji} size={20} />
</button>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;
	
	.jump-to-reaction {
		position: absolute;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: var(--c-bg-3);
		border: 1px solid var(--c-border);
		padding-top: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);
		box-shadow: var(--shadow-lg, 0 2px 8px rgba(0, 0, 0, 0.3));
		z-index: 10;
		@include glass;
		bottom: calc(var(--safe-bottom) + 52px);
		right: 0;
	}

	.jump-to-reaction.stacked {
		bottom: calc(var(--safe-bottom) + 52px + 56px);
	}
</style>
