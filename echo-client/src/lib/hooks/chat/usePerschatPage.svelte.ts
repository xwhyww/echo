import { page } from '$app/state';
import { goto } from '$app/navigation';
import { auth } from '$lib/stores/auth.svelte.js';
import { personalChatsStore } from '$lib/stores/personalChats.svelte.js';
import { pinnedBar } from '$lib/stores/pinnedBar.svelte.js';
import { routes } from '$lib/routes.js';
import { usePersonalChat } from '$lib/hooks/chat/usePersonalChat.svelte.js';
import { usePersonalChatActions } from '$lib/hooks/chat/usePersonalChatActions.svelte.js';
import { useChatSearch } from '$lib/hooks/chat/useChatSearch.svelte.js';
import { useMentionNavigation } from '$lib/hooks/chat/useMentionNavigation.svelte.js';
import { useMessageSelection } from '$lib/hooks/chat/useMessageSelection.svelte.js';

/**
 * The one-to-one conversation screen: the chat itself plus the four things
 * layered over it — search, multi-select, message actions and @mention
 * navigation. Route-bound, so it reads `page` itself.
 */
export function usePerschatPage() {
	const companionId = $derived(page.params.id!);

	const chat = usePersonalChat();
	const mentions = useMentionNavigation();

	const currentChat = $derived(personalChatsStore.findByUserId(companionId) ?? null);
	const companion = $derived(currentChat?.user ?? personalChatsStore.tempChat?.user ?? null);

	const search = useChatSearch(() => currentChat?.id ?? null);
	// Click-to-toggle plus click-and-drag over a range; the hook owns the
	// gesture, this screen only decides what forward and delete do with it.
	const selection = useMessageSelection(() => chat.messages, () => auth.user?.id);
	const actions = usePersonalChatActions(chat, selection);

	const privacyMessaging = $derived(companion?.privacyMessaging ?? 'all');
	const canMessage = $derived(
		chat.isSelf
		|| privacyMessaging === 'all'
		|| (privacyMessaging === 'existing' && chat.messages.length > 0),
	);

	const unseenReaction = $derived(currentChat?.unseenReaction ?? null);

	// The reaction dot clears once the message carrying it has actually been on
	// screen — scrolling past is what counts as having seen it, not opening the
	// chat.
	$effect(() => {
		const chatId = currentChat?.id;
		const messageId = unseenReaction?.messageId;
		if (!chatId || !messageId) return;
		void chat.messages;
		const container = chat.messagesContainer;
		if (!container) return;
		const el = container.querySelector(`[data-msg-id="${messageId}"]`);
		if (!el) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					personalChatsStore.setUnseenReaction(chatId, null);
				}
			},
			{ root: container, threshold: 0.25 },
		);
		observer.observe(el);
		return () => observer.disconnect();
	});

	// The pinned bar is rendered once by the app-wide stack (AppBars.svelte);
	// this screen only supplies the data while it is the one on show.
	$effect(() =>
		pinnedBar.claim({
			pinned: chat.pinnedMessages,
			onjump: (id) => chat.jumpToMessage(id),
			onunpin: (id) => chat.unpinMessage(id),
		}),
	);

	return {
		get chat() { return chat; },
		get actions() { return actions; },
		get search() { return search; },
		get selection() { return selection; },
		get mentions() { return mentions; },
		get companion() { return companion; },
		get companionId() { return companionId; },
		get canMessage() { return canMessage; },
		get unseenReaction() { return unseenReaction; },
		openInfo() { goto(routes.chats.perschatInfo(companionId)); },
	};
}
