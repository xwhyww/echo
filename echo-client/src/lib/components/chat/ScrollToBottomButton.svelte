<script lang="ts">
	import { ArrowDown } from 'lucide-svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// Floats over the message list once it's scrolled away from the newest
	// message, badged with how many arrived since.
	interface Props {
		unread: number;
		onclick: () => void;
		/**
		 * How far up from the bottom to sit. Surfaces whose composer floats over
		 * the list need to clear it; ones with the composer in flow don't.
		 */
		bottom?: string;
	}

	let { unread, onclick, bottom = '64px' }: Props = $props();
</script>

<button
	class="scroll-to-bottom text-default"
	style:--scroll-btn-bottom={bottom}
	{onclick}
	aria-label={t.chat.jumpToLatest}
>
	{#if unread > 0}
		<span class="badge body-xs fw-semibold text-inverse">{unread > 99 ? '99+' : unread}</span>
	{/if}
	<ArrowDown size={18} />
</button>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.scroll-to-bottom {
		position: absolute;
		bottom: var(--scroll-btn-bottom);
		right: 12px;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);
		box-shadow: var(--shadow-lg, 0 2px 8px rgba(0, 0, 0, 0.3));
		z-index: 10;
		@include glass;
	}

	.scroll-to-bottom:hover {
		background: var(--c-bg-4, var(--c-bg-3));
	}

	.badge {
		position: absolute;
		top: -6px;
		right: -6px;
		min-width: 20px;
		height: 20px;
		padding: 0 5px;
		border-radius: var(--radius-full);
		background: var(--c-accent);
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
