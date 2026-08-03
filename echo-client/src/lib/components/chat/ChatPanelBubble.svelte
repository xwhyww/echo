<script lang="ts">
	import { auth } from '$lib/stores/auth.svelte.js';
	import ChatBubble from '$lib/components/chat/ChatBubble.svelte';
	import type { ChatMessage } from '$lib/chat/types.js';
	import type { Attachment, ForwardedFrom } from '$lib/api/personalChats.js';
	import type { useMessageSelection } from '$lib/hooks/chat/useMessageSelection.svelte.js';

	// One message in a group or voice-channel chat. `ChatBubble` is deliberately
	// generic — it takes each piece as a prop — and this is where the wiring for
	// those two surfaces lives, exactly as `PersonalChatBubble` does for the
	// one-to-one case.
	//
	// The actions arrive as one object rather than eight props because they are
	// one thing: what this surface can do to a message. `ChatPanel` builds it
	// once instead of closing over each message.
	export interface ChatRowActions {
		edit: (id: string, content: string) => void;
		remove: (id: string) => void;
		pin: (id: string) => void;
		unpin: (id: string) => void;
		react: (id: string, emoji: string) => void;
		openEmoji: (id: string) => void;
		openMedia: (attachments: Attachment[], index: number) => void;
		forward: (id: string) => void;
	}

	interface Props {
		msg: ChatMessage;
		/** The message below is from the same author, so this one's avatar hides. */
		hideAvatar: boolean;
		selection: ReturnType<typeof useMessageSelection>;
		reactorLookup?: (userId: string) => { name: string; avatarUrl: string | null } | null;
		actions: ChatRowActions;
	}

	let { msg, hideAvatar, selection, reactorLookup, actions }: Props = $props();
</script>

<ChatBubble
	id={msg.id}
	{hideAvatar}
	content={msg.content}
	attachments={msg.attachments as unknown as Attachment[]}
	authorName={msg.author.displayName ?? msg.author.username}
	avatarUrl={msg.author.avatarUrl}
	time={msg.createdAt}
	own={msg.authorId === auth.user?.id}
	isEdited={msg.isEdited}
	isPinned={!!msg.pinnedAt}
	forwardedFrom={msg.forwardedFrom as ForwardedFrom | null | undefined}
	reactions={msg.reactions ?? []}
	currentUserId={auth.user?.id ?? null}
	{reactorLookup}
	selecting={selection.selecting}
	selected={selection.has(msg.id)}
	onselect={selection.toggle}
	onforward={() => actions.forward(msg.id)}
	onedit={(content) => actions.edit(msg.id, content)}
	ondelete={() => actions.remove(msg.id)}
	onpin={() => actions.pin(msg.id)}
	onunpin={() => actions.unpin(msg.id)}
	onreact={(emoji) => actions.react(msg.id, emoji)}
	onopenemoji={() => actions.openEmoji(msg.id)}
	onmedia={actions.openMedia}
/>
