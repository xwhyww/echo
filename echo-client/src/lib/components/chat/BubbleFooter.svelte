<script lang="ts">
	import MessageTime from '$lib/components/chat/MessageTime.svelte';
	import ReactionChip from '$lib/components/emoji/ReactionChip.svelte';
	import type { MessageReaction } from '$lib/api/personalChats.js';

	// The bottom line of a bubble: reaction chips on the left, timestamp and
	// delivery state pinned right.
	interface Props {
		reactions?: MessageReaction[];
		currentUserId?: string | null;
		reactorLookup?: (userId: string) => { name: string; avatarUrl: string | null } | null;
		own?: boolean;
		time: string;
		read?: boolean;
		isEdited?: boolean;
		onreact: (emoji: string) => void;
	}

	let {
		reactions = [],
		currentUserId = null,
		reactorLookup,
		own = false,
		time,
		read = false,
		isEdited = false,
		onreact,
	}: Props = $props();
</script>

<div class="message-bottom">
	{#if reactions.length > 0}
		<div class="reactions-row">
			{#each reactions as r (r.emoji)}
				<ReactionChip
					emoji={r.emoji}
					count={r.count}
					userIds={r.userIds}
					{currentUserId}
					{reactorLookup}
					{own}
					{onreact}
				/>
			{/each}
		</div>
	{/if}

	<div class="message-time">
		<MessageTime {time} {own} {read} {isEdited} />
	</div>
</div>

<style>
	.message-bottom {
		display: flex;
		flex-direction: row;
		align-items: flex-end;
		justify-content: space-between;
		width: 100%;
		margin-top: 3px;
	}

	.reactions-row {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: var(--sp-1);
		margin-right: 8px;
	}

	/* space-between only right-aligns the time while a reactions row shares the
	   line with it; alone it would sit at flex-start. An auto margin pins it to
	   the right edge in both cases. */
	.message-time {
		margin-left: auto;
	}
</style>
