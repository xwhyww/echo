<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Send } from 'lucide-svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';

	// One place to forward to. Groups and people were two copies of this row,
	// differing only in what stands in for a missing picture.
	interface Props {
		name: string;
		avatarUrl?: string | null;
		/** Shown instead of initials when there's no picture — groups use one. */
		icon?: Snippet;
		onclick: () => void;
	}

	let { name, avatarUrl, icon, onclick }: Props = $props();
</script>

<button class="forward-item text-default" {onclick}>
	{#if icon && !avatarUrl}
		<div class="icon-fallback text-muted">{@render icon()}</div>
	{:else}
		<Avatar {name} {avatarUrl} size={36} />
	{/if}
	<span class="forward-item-name body-sm text-default">{name}</span>
	<Send size={18} />
</button>

<style>
	.forward-item {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		width: 100%;
		padding: var(--sp-2) 0;
		border-radius: var(--radius-sm);
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: background var(--duration-fast) var(--ease-default);
	}

	.forward-item:hover {
		background: var(--c-bg-3);
	}

	.forward-item-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.icon-fallback {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--c-bg-3);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	/* The send arrow appears on hover — a hint at what clicking does, not a
	 * second control. */
	.forward-item :global(svg:last-child) {
		color: var(--c-text-faint);
		flex-shrink: 0;
		opacity: 0;
		transition: opacity var(--duration-fast) var(--ease-default);
	}

	.forward-item:hover :global(svg:last-child) {
		opacity: 1;
		color: var(--c-accent-text);
	}
</style>
