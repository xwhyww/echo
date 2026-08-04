<script lang="ts">
	import Avatar from '$lib/components/user/Avatar.svelte';
	import AppleEmoji from '$lib/components/emoji/AppleEmoji.svelte';

	interface Props {
		emoji: string;
		count: number;
		userIds: string[];
		currentUserId?: string | null;
		reactorLookup?: (userId: string) => { name: string; avatarUrl: string | null } | null;
		own?: boolean;
		onreact?: (emoji: string) => void;
	}

	let { emoji, count, userIds, currentUserId = null, reactorLookup, own = false, onreact }: Props = $props();

	const mine = $derived(currentUserId !== null && userIds.includes(currentUserId));
	const withCounter = $derived(count > 2);
</script>

<button
	type="button"
	class="reaction-chip others body-xs text-default"
	class:mine
	class:own
	class:with-counter={withCounter}
	onclick={(e) => { e.stopPropagation(); onreact?.(emoji); }}
	title={`${count} ${count === 1 ? 'reaction' : 'reactions'}`}
>
	<div class="reaction-emoji"><AppleEmoji {emoji} size={16} /></div>
	{#if withCounter}
		<span class="reaction-count">{count}</span>
	{:else if reactorLookup}
		<span class="reaction-avatars">
			{#each userIds.slice(0, 2) as uid (uid)}
				{@const u = reactorLookup(uid)}
				{#if u}
					<Avatar name={u.name} avatarUrl={u.avatarUrl} size={18} />
				{/if}
			{/each}
		</span>
	{/if}
</button>

<style>
	.reaction-chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		padding: 1px 4px;
		border-radius: 999px;
		border: 1px solid transparent;
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default),
			border-color var(--duration-fast) var(--ease-default);
	}

	.reaction-chip.with-counter {
		padding: 2px 8px 2px 2px;
	}

	.reaction-emoji {
		display: flex;
		justify-content: center;
		align-items: center;
		margin-top: 1px;
	}

	.reaction-avatars {
		display: inline-flex;
		align-items: center;
	}

	.reaction-avatars :global(.avatar:first-child) {
		position: relative;
		z-index: 2;
	}

	.reaction-avatars :global(.avatar:not(:first-child)) {
		margin-left: -8px;
		z-index: 1;
	}

	.reaction-chip.own .reaction-avatars :global(.avatar) {
		border-color: var(--c-own-bubble);
	}

	.reaction-chip.others {
		background: var(--c-accent-subtle-3);
		border-color: var(--c-accent-subtle-3);
	}

	.reaction-chip.mine {
		background: var(--c-accent-subtle-2);
		border-color: var(--c-accent-subtle-2);
	}

	.reaction-count {
		font-variant-numeric: tabular-nums;
	}
</style>
