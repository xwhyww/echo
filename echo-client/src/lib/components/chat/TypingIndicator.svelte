<script lang="ts">
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// "X is typing…" in the chat header, where it stands in for the presence
	// line. Renders nothing when nobody is typing, so the caller doesn't have to
	// ask twice.
	interface Props {
		users: { username: string }[];
	}

	let { users }: Props = $props();

	const label = $derived(
		users.length === 1
			? t.chat.typingOne(users[0].username)
			: users.length === 2
				? t.chat.typingTwo(users[0].username, users[1].username)
				: t.chat.typingMany(users.length),
	);
</script>

{#if users.length > 0}
	<div class="typing body-xs text-muted">
		<span>{label}</span>
		<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>
	</div>
{/if}

<style>
	/* No padding or reserved height: it now sits in a line the header lays out,
	   and taking more room than the presence line it replaces would nudge the
	   whole bar every time someone starts typing. */
	.typing {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.typing-dots span {
		animation: typingBounce 1.4s infinite;
		display: inline-block;
	}

	.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
	.typing-dots span:nth-child(3) { animation-delay: 0.4s; }

	@keyframes typingBounce {
		0%, 60%, 100% { opacity: 0.3; }
		30% { opacity: 1; }
	}

	@media (prefers-reduced-motion: reduce) {
		.typing-dots span { animation: none; }
	}
</style>
