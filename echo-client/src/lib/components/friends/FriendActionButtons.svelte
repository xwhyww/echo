<script lang="ts">
	import { MessageSquare, UserPlus, UserMinus } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { useFriendship } from '$lib/hooks/friends/useFriendship.svelte.js';

	const t = $derived(i18n.t);

	// What you can do about another person from their profile: open the chat,
	// and whichever one friendship move their current status allows.
	interface Props {
		friendship: ReturnType<typeof useFriendship>;
		onmessage: () => void;
		onremove: () => void;
		/** A restricted profile offers no way to drop the friendship. */
		allowRemove?: boolean;
	}

	let { friendship, onmessage, onremove, allowRemove = true }: Props = $props();
</script>

<div class="actions">
	<Button variant="primary" onclick={onmessage}>
		<MessageSquare size={14} />
		{t.userProfile.message}
	</Button>

	{#if friendship.status === 'none'}
		<Button variant="ghost" onclick={friendship.sendRequest} disabled={friendship.acting}>
			<UserPlus size={14} />
			{t.userProfile.addFriend}
		</Button>
	{:else if friendship.status === 'friends' && allowRemove}
		<Button variant="ghost" onclick={onremove} disabled={friendship.acting}>
			<UserMinus size={14} />
			{t.userProfile.removeFriend}
		</Button>
	{:else if friendship.status === 'pending' && friendship.direction === 'outgoing'}
		<Button variant="ghost" disabled>
			{t.userProfile.requestSent}
		</Button>
	{/if}
</div>

<style>
	.actions {
		display: flex;
		gap: var(--sp-2);
		flex-direction: column;
	}
</style>
