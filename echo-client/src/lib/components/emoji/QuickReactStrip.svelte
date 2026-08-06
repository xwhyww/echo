<script lang="ts">
	import { SmilePlus } from 'lucide-svelte';
	import AppleEmoji from '$lib/components/emoji/AppleEmoji.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// The row of one-tap reactions above a message menu. The shortlist is fixed:
	// anything outside it goes through the full picker behind `onmore`.
	const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'];

	interface Props {
		/** Highlighted so the reaction already given reads as a toggle. */
		myReactionEmoji?: string | null;
		onreact: (emoji: string) => void;
		/** Opens the full picker. Omit it and the strip ends at the shortlist. */
		onmore?: () => void;
	}

	let { myReactionEmoji = null, onreact, onmore }: Props = $props();
</script>

<div class="quick-react-strip">
	{#each QUICK_REACTIONS as emoji (emoji)}
		<button
			type="button"
			class="quick-react lh-none"
			class:active={myReactionEmoji === emoji}
			onclick={() => onreact(emoji)}
			aria-label={t.chat.reactWith(emoji)}
		><AppleEmoji {emoji} size={20} /></button>
	{/each}
	{#if onmore}
		<button
			type="button"
			class="quick-react more lh-none"
			onclick={onmore}
			aria-label={t.chat.moreEmojis}
		>
			<SmilePlus size={18} />
		</button>
	{/if}
</div>

<style>
	.quick-react-strip {
		display: flex;
		gap: 2px;
		padding: var(--sp-1);
		margin-bottom: var(--sp-1);
		border-bottom: 1px solid var(--c-border);
	}

	.quick-react {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		padding: 0;
		border: none;
		background: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-default),
			transform var(--duration-fast) var(--ease-default);
	}

	.quick-react.active {
		background: var(--c-accent-subtle);
	}

	.quick-react.more {
		color: var(--c-text-muted);
	}
</style>
