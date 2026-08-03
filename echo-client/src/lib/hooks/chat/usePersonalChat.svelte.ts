import { page } from '$app/state';
import { auth } from '$lib/stores/auth.svelte.js';
import { ws } from '$lib/stores/ws.svelte.js';
import { onDestroy, tick, untrack } from 'svelte';
import type { PersonalChat, PersonalMessage } from '$lib/api/personalChats.js';
import { personalChatsService } from '$lib/api/personalChatsService.js';
import { personalChatsStore } from '$lib/stores/personalChats.svelte.js';
import { draftsMap, setDraftFor, setEditingDraft } from '$lib/hooks/chat/chatDrafts.svelte.js';
import { useChatScroll } from '$lib/hooks/chat/useChatScroll.svelte.js';
import { useDmComposer } from '$lib/hooks/chat/useDmComposer.svelte.js';
import { useDmHistory } from '$lib/hooks/chat/useDmHistory.svelte.js';
import { useDmMessageActions } from '$lib/hooks/chat/useDmMessageActions.svelte.js';
import { useDmReadState } from '$lib/hooks/chat/useDmReadState.svelte.js';
import { useTypingIndicator } from '$lib/hooks/chat/useTypingIndicator.svelte.js';
import {
	cacheChat,
	invalidateChatCache,
	takeCachedChat,
	type ChatCache,
} from '$lib/utils/personalChatCache.js';
import { applyDmEvent } from '$lib/utils/personalChatEvents.js';
import { lastMessagePreview } from '$lib/utils/personalChatPreview.js';

const MAX_MESSAGES_PER_CHAT = 5000;
/** Someone reading this close to the end gets carried along by a new message. */
const AUTO_SCROLL_ON_NEW_THRESHOLD = 300;

export function usePersonalChat() {
	// Always present: this hook only ever runs under /chats/perschat/[id].
	const companionId = $derived(page.params.id!);
	const companion = $derived(personalChatsStore.findByUserId(companionId)?.user ?? personalChatsStore.tempChat?.user ?? null);
	const chatWith = $derived(companion?.username ?? null);
	const isSelf = $derived(companionId === auth.user?.id);

	let chatId = $state<string | null>(null);
	let otherLastReadAt = $state<string | null>(null);
	let firstUnreadMessageId = $state<string | null>(null);
	let pinnedMessages = $state<PersonalMessage[]>([]);

	// The conversation itself: the window on screen, and every way of fetching
	// more of it. `win` is the window; it belongs to the history and is aliased
	// here because half this file reads from it.
	const history = useDmHistory(() => chatId, MAX_MESSAGES_PER_CHAT);
	const win = history.window;

	const typing = useTypingIndicator(() => chatId);

	const composer = useDmComposer({
		companionId: () => companionId,
		companion: () => companion,
		// Sending while reading history means catching up first — otherwise the
		// message would land in a window that isn't showing the end.
		beforeSend: async () => {
			if (win.hasNewer) await jumpToBottom();
		},
		onSent: (sentChatId, message) => {
			chatId = sentChatId;
			win.push(message);
		},
		afterSent: () => scrollToBottom(),
		ontyping: () => typing.notify(),
	});

	// Acting on one message — the lists stay here, the doing lives there.
	const act = useDmMessageActions({
		chatId: () => chatId,
		messages: () => win.messages,
		pinned: () => pinnedMessages,
		setMessages: (next) => (win.messages = next),
		setPinned: (next) => (pinnedMessages = next),
	});

	// This surface pages both ways: it can be showing a window from the middle
	// of the conversation, with more to fetch above *and* below.
	const scroll = useChatScroll({
		onReachTop: () => {
			if (skipNextScroll) return;
			skipNextScroll = true;
			void loadOlderMessages().finally(() => (skipNextScroll = false));
		},
		onNearBottom: () => {
			if (history.loadingOlder) return;
			void loadNewerMessages();
		},
	});

	// Read receipts and the "new messages below" counter — one concern, because
	// catching up with the end is exactly what marks the chat read.
	const read = useDmReadState({
		chatId: () => chatId,
		hasNewer: () => win.hasNewer,
		pinnedToBottom: () => scroll.pinnedToBottom,
	});

	/** Back to the newest message — and once there, nothing is waiting below. */
	function scrollToBottom() {
		scroll.toBottom();
		read.clear();
	}

	const unsubscribe = ws.on((event) => {
		// Everything except an arriving message is a plain change to the two
		// lists; where it lands doesn't depend on where the reader is looking.
		const next = applyDmEvent({ messages: win.messages, pinnedMessages }, event, chatId, auth.user?.id);
		if (next) {
			win.messages = next.messages;
			pinnedMessages = next.pinnedMessages;
			return;
		}

		if (event.type === 'dm') {
			const isCurrentChat = chatId && event.chatId === chatId;
			const isNewChatFromCompanion = !chatId && event.message.authorId === companionId;
			if (isCurrentChat || isNewChatFromCompanion) {
				if (event.message.authorId === auth.user?.id) return;
				if (!chatId) chatId = event.chatId;

				typing.forget(event.message.authorId);

				if (win.hasNewer) {
					// User is viewing historical messages — don't append, just count
					read.noteArrival();
				} else {
					// Measure BEFORE appending so the new message's height doesn't
					// skew the distance calculation.
					const el = scroll.element;
					const distFromBottom = el ? el.scrollHeight - el.scrollTop - el.clientHeight : 0;
					const shouldAutoScroll = distFromBottom < AUTO_SCROLL_ON_NEW_THRESHOLD;

					win.push(event.message);
					if (shouldAutoScroll) {
						scrollToBottom();
						read.markIfFocused();
					} else {
						read.noteArrival();
					}
				}
				composer.blockedReason = null;
			}
		} else if (event.type === 'chat_read' && chatId && event.chatId === chatId) {
			otherLastReadAt = event.lastReadAt;
		} else if (event.type === 'reconnected') {
			fillGapAfterReconnect();
		} else if (event.type === 'typing' && chatId && event.chatId === chatId) {
			if (event.userId === auth.user?.id) return;
			typing.track(event.userId, event.username);
		}
	});

	onDestroy(() => {
		unsubscribe();
		history.abort();
		saveToCache();
	});

	// `snapshot` and `restore` are a pair: a field added to one and forgotten
	// in the other is a conversation that comes back subtly wrong, which is why
	// they sit together rather than inline at the two call sites.
	function snapshot(): ChatCache {
		return {
			...win.snapshot(),
			chatId: chatId!,
			otherLastReadAt,
			draft: composer.draft,
			firstUnreadMessageId,
			scrollPosition: scroll.pinnedToBottom ? null : scroll.distanceFromBottom,
			pinnedMessages,
		};
	}

	function restore(cached: ChatCache, userId: string) {
		win.restore(cached);
		chatId = cached.chatId;
		otherLastReadAt = cached.otherLastReadAt;
		composer.draft = cached.draft || draftsMap.get(userId) || '';
		firstUnreadMessageId = cached.firstUnreadMessageId;
		pinnedMessages = cached.pinnedMessages;
	}

	function saveToCache() {
		if (!prevCompanionId) return;
		setDraftFor(prevCompanionId, composer.draft.trim() ? composer.draft : '');
		if (chatId) cacheChat(prevCompanionId, snapshot());
	}

	let prevCompanionId: string | undefined;

	$effect(() => {
		const userId = companionId;
		const isLoaded = personalChatsStore.loaded;
		if (!userId) return;
		// On a direct load of this route the chat sidebar never mounts, so nothing
		// else fetches the list — kick it off here and let the effect re-run once
		// `loaded` flips.
		if (!isLoaded) {
			if (auth.token) personalChatsStore.ensureLoaded();
			return;
		}
		untrack(() => {
			if (!auth.token) return;
			history.abort();
			// Everything the outgoing conversation had is written down before any
			// of it is cleared.
			saveToCache();
			setEditingDraft(null);
			prevCompanionId = userId;
			history.reset();
			pinnedMessages = [];
			chatId = null;
			otherLastReadAt = null;
			scroll.pinnedToBottom = true;
			read.clear();
			firstUnreadMessageId = null;
			typing.reset();
			composer.cancelReply();
			composer.draft = draftsMap.get(userId) ?? '';
			loadChat(userId);
		});
	});

	async function loadChat(userId: string) {
		const signal = history.newSignal();
		const cached = takeCachedChat(userId);
		if (cached) {
			restore(cached, userId);
			history.loading = false;
			await tick();
			if (cached.scrollPosition === null) scrollToBottom();
			else scroll.restoreDistanceFromBottom(cached.scrollPosition);
			history.ready = true;
			return;
		}

		try {
			let existing = personalChatsStore.findByUserId(userId);
			if (!existing) {
				const lookup = await personalChatsService.getByCompanionId(userId);
				if (lookup.chat) {
					existing = lookup.chat;
				}
			}
			if (existing || userId !== auth.user?.id) {
				chatId = existing?.id || userId;
				const res = await history.loadNewest(chatId!, signal);
				otherLastReadAt = res.otherLastReadAt;
				personalChatsStore.list = personalChatsStore.list.map((c) =>
					c.id === chatId ? { ...c, unreadCount: 0 } : c
				);
				void act.loadPinned();
			}
		} catch (e) {
			// Aborted means a newer load is already running — it will finish the
			// job, and saying "loaded" here would let the old one land on top.
			if (e instanceof DOMException && e.name === 'AbortError') return;
			// Chat may not exist yet
		}
		history.loading = false;
		await tick();
		scrollToBottom();
		history.ready = true;
	}

	async function loadOlderMessages() {
		// Remember the first visible message to anchor scroll after prepend.
		const anchorId = win.messages[0]?.id;
		if (await history.loadOlder()) scroll.restoreAnchor(anchorId);
	}

	async function loadNewerMessages() {
		if (!(await history.loadNewer())) return;
		// Having reached the end, there is nothing left below to be unread.
		if (!win.hasNewer) read.catchUp();
	}

	async function fillGapAfterReconnect() {
		const arrived = await history.fillGap();
		if (arrived === 0) return;
		if (scroll.pinnedToBottom) {
			scrollToBottom();
			read.markIfFocused();
		} else {
			read.noteArrival(arrived);
		}
	}

	async function jumpToBottom() {
		if (!chatId) return;
		if (!win.hasNewer) {
			scrollToBottom();
			read.markIfFocused();
			return;
		}
		if (await history.jumpToNewest()) read.markIfFocused();
		scrollToBottom();
	}

	let skipNextScroll = false;

	function handleScroll() {
		scroll.onScroll();
		read.noteScroll();
	}

	async function forwardMessages(messageIds: string[], target: PersonalChat): Promise<string | null> {
		try {
			const res = await personalChatsService.forwardMessages(messageIds, target.user.id);

			// Invalidate any cached state for the target chat so navigation refetches.
			invalidateChatCache(target.user.id);

			// Show the forwarded message as the target chat's last one.
			const lastForwarded = res.messages.at(-1);
			if (lastForwarded) {
				personalChatsStore.noteOutgoing(res.chatId, target.user, lastMessagePreview(lastForwarded));
			}

			return res.chatId;
		} catch (e) {
			console.error('Failed to forward messages:', e);
			return null;
		}
	}

	async function jumpToMessage(messageId: string): Promise<boolean> {
		if (!chatId) return false;
		if (win.messages.some(m => m.id === messageId)) {
			await tick();
			return scroll.jumpTo(messageId);
		}

		// Asked before anything on screen changes, so a link to a message that
		// isn't there disturbs nothing.
		const res = await history.loadAround(messageId);
		if (!res) return false;

		history.ready = false;
		history.loading = true;
		history.showAround(res);
		otherLastReadAt = res.otherLastReadAt;
		scroll.pinnedToBottom = !res.hasNewer;
		history.loading = false;
		history.ready = true;
		await tick();
		return scroll.jumpTo(messageId);
	}

	return {
		get chatWith() { return chatWith; },
		get isSelf() { return isSelf; },
		get messages() { return win.messages; },
		get loading() { return history.loading; },
		get loadingOlder() { return history.loadingOlder; },
		get loadingNewer() { return history.loadingNewer; },
		get hasMore() { return win.hasOlder; },
		get hasOlder() { return win.hasOlder; },
		get hasNewer() { return win.hasNewer; },
		get otherLastReadAt() { return otherLastReadAt; },
		get blockedReason() { return composer.blockedReason; },
		get uploadTasks() { return composer.uploadTasks; },
		get messagesContainer() { return scroll.element; },
		set messagesContainer(el: HTMLElement | null) { scroll.element = el; },
		get pinnedToBottom() { return scroll.pinnedToBottom; },
		get newMessagesBelow() { return read.count; },
		get draft() { return composer.draft; },
		get typingUsers() { return typing.users; },
		get firstUnreadMessageId() { return firstUnreadMessageId; },
		handleSend: composer.send,
		handleSendVoice: composer.sendVoice,
		handleScroll,
		handleDraftChange: composer.onDraftChange,
		jumpToBottom,
		editMessage: act.edit,
		deleteMessage: act.remove,
		deleteMessages: act.removeMany,
		forwardMessages,
		get pinnedMessages() { return pinnedMessages; },
		get replyingTo() { return composer.replyingTo; },
		setReply: composer.setReply,
		cancelReply: composer.cancelReply,
		pinMessage: act.pin,
		unpinMessage: act.unpin,
		setReaction: act.react,
		clearReaction: act.clearReaction,
		jumpToMessage,
		cancelUpload: composer.cancelUpload,
		removeFailedUpload: composer.removeFailedUpload,
		retryUpload: composer.retryUpload,
	};
}
