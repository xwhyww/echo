<script lang="ts">
	import ChatBubble from '$lib/components/chat/ChatBubble.svelte';
	import { auth } from '$lib/stores/auth.svelte.js';
	import {
		isReadByCompanion,
		personalReactorLookup,
		seenByCompanion,
		type ChatParty,
	} from '$lib/utils/personalChat.js';
	import type { usePersonalChat } from '$lib/hooks/chat/usePersonalChat.svelte.js';
	import type { usePersonalChatActions } from '$lib/hooks/chat/usePersonalChatActions.svelte.js';
	import type { useMessageSelection } from '$lib/hooks/chat/useMessageSelection.svelte.js';
	import type { useMentionNavigation } from '$lib/hooks/chat/useMentionNavigation.svelte.js';
	import type { PersonalMessage } from '$lib/api/personalChats.js';

	// One message in a one-to-one conversation. `ChatBubble` is deliberately
	// generic — it takes each piece as a prop so group and voice chats can wire
	// it differently — and this is where the personal-chat wiring lives.
	interface Props {
		message: PersonalMessage;
		/** The message directly below this one, for avatar stacking. */
		next?: PersonalMessage;
		companion: ChatParty | null;
		chat: ReturnType<typeof usePersonalChat>;
		actions: ReturnType<typeof usePersonalChatActions>;
		selection: ReturnType<typeof useMessageSelection>;
		mentions: ReturnType<typeof useMentionNavigation>;
	}

	let { message: msg, next, companion, chat, actions, selection, mentions }: Props = $props();

	const myId = $derived(auth.user?.id);
	const own = $derived(msg.authorId === myId);

	function reactorLookup(userId: string) {
		return personalReactorLookup(userId, auth.user ?? null, companion);
	}
</script>

<ChatBubble
	id={msg.id}
	content={msg.content}
	attachments={msg.attachments}
	authorName={msg.author.displayName ?? msg.author.username}
	avatarUrl={msg.author.avatarUrl}
	time={msg.createdAt}
	{own}
	read={isReadByCompanion(msg, myId, chat.otherLastReadAt)}
	seenBy={seenByCompanion(msg, myId, companion, chat.otherLastReadAt)}
	isEdited={msg.isEdited}
	isPinned={!!msg.pinnedAt}
	replyToId={msg.replyToId}
	replyToSnapshot={msg.replyToSnapshot}
	forwardedFrom={msg.forwardedFrom}
	reactions={msg.reactions ?? []}
	currentUserId={myId ?? null}
	{reactorLookup}
	hideAvatar={next?.authorId === msg.authorId}
	selecting={selection.selecting}
	selected={selection.has(msg.id)}
	onselect={selection.toggle}
	onforward={() => actions.forwardOne(msg.id)}
	onedit={(content, attachments) => actions.openEdit(msg.id, content, attachments)}
	ondelete={() => actions.confirmDelete([msg.id])}
	onpin={() => actions.pin(msg.id)}
	onunpin={() => chat.unpinMessage(msg.id)}
	onreply={() => chat.setReply(msg)}
	onreact={(emoji) => actions.react(msg.id, emoji)}
	onopenemoji={() => actions.openReactionPicker(msg.id)}
	onreplyjump={actions.jumpTo}
	onmedia={actions.openMedia}
	onmention={mentions.openMention}
	onuserclick={mentions.openUser}
/>
