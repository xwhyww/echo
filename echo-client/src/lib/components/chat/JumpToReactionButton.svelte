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

<style>
	.jump-to-reaction {
		position: absolute;
		bottom: 8px;
		right: 20px;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--c-bg-3);
		border: 1px solid var(--c-border);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);
		box-shadow: var(--shadow-lg, 0 2px 8px rgba(0, 0, 0, 0.3));
		z-index: 10;
	}

	.jump-to-reaction.stacked { bottom: 56px; }
</style>
