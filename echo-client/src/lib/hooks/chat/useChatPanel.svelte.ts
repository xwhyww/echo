import { onDestroy, onMount, tick, untrack } from 'svelte';
import { auth } from '$lib/stores/auth.svelte.js';
import { toasts } from '$lib/stores/toasts.svelte.js';
import { pinnedBar } from '$lib/stores/pinnedBar.svelte.js';
import { ws, type WsEvent } from '$lib/stores/ws.svelte.js';
import { useChatActions } from '$lib/hooks/chat/useChatActions.svelte.js';
import { useChatScroll } from '$lib/hooks/chat/useChatScroll.svelte.js';
import { useMessageSelection } from '$lib/hooks/chat/useMessageSelection.svelte.js';
import { rememberChat } from '$lib/utils/chatCache.js';
import { applyChatEvent } from '$lib/utils/chatEvents.js';
import { mergeWindow } from '$lib/utils/messageWindow.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';
import type {
	ChatAttachment,
	ChatMessage,
	ChatPanelCache,
	ChatPanelEvent,
	ChatService,
} from '$lib/chat/types.js';

export interface ChatPanelOptions<TMsg extends ChatMessage, TAtt extends ChatAttachment> {
	/** Service-call key: a group id for group chat, a channel id for voice chat. */
	id: () => string;
	/**
	 * Blob-scope owner for uploads. Voice channels share their parent group's
	 * scope, so it isn't always the same as `id`.
	 */
	uploadId: () => string;
	service: () => ChatService<TMsg, TAtt>;
	/** Per-surface warm cache, owned by the caller so surfaces don't share one. */
	cache: () => Map<string, ChatPanelCache>;
	/**
	 * Narrows the socket firehose to this surface's events, normalised. Each
	 * caller maps its own WS variants onto one shape so nothing below cares
	 * which kind of chat this is.
	 */
	matchEvent: (e: WsEvent) => ChatPanelEvent | null;
	/**
	 * Does opening this chat have anything to acknowledge? Re-entering a
	 * conversation you are already caught up on posts a read receipt that moves
	 * no marker, so callers that can tell (the group page reads the unread count
	 * the socket keeps for it) say so and save the request. Left out means
	 * "don't know", and the receipt is sent as before.
	 *
	 * Asked exactly once per open, at the moment the chat is opened — not read
	 * from a value the caller prepared, because the caller's effect and this
	 * one do not run in a fixed order.
	 */
	hasUnreadOnOpen?: (id: string) => boolean;
	/** After the first load resolves — callers mark the chat read locally, etc. */
	onLoaded?: () => void;
	/** A message arrived over the socket, for callers keeping their own previews. */
	onMessageReceived?: (msg: ChatMessage) => void;
}

/**
 * A chat surface's message list: loading it, keeping it live, and the warm
 * cache that makes switching conversations instant.
 *
 * Scrolling and the message actions are their own hooks — this composes them
 * and hands the component one object. The component renders; this decides.
 */
export function useChatPanel<TMsg extends ChatMessage, TAtt extends ChatAttachment>(
	options: ChatPanelOptions<TMsg, TAtt>,
) {
	const t = $derived(i18n.t);
	const id = $derived(options.id());
	const service = $derived(options.service());
	const cache = $derived(options.cache());

	let messages = $state<ChatMessage[]>([]);
	let pinnedMessages = $state<ChatMessage[]>([]);
	let loading = $state(true);
	let loadingOlder = $state(false);
	let hasMore = $state(false);
	let nextCursor = $state<string | null>(null);

	const selection = useMessageSelection(() => messages, () => auth.user?.id);
	const scroll = useChatScroll({
		onReachTop: () => {
			if (hasMore && !loadingOlder) void loadOlder();
		},
	});
	const actions = useChatActions({
		id: options.id,
		uploadId: options.uploadId,
		service: options.service,
		messages: () => messages,
		selection,
	});

	// Which conversation the current state belongs to — what `saveToCache` banks
	// under when the id changes out from under it.
	let prevId: string | undefined;

	// ─── Warm cache ───────────────────────────────────────────

	function saveToCache() {
		if (!prevId) return;
		// Bail when we'd be caching the pre-load empty state. SvelteKit hydration
		// mounts the panel a few times during the initial nav, and an instance
		// torn down mid-load otherwise writes `messages: []` into the cache — the
		// next instance hits that entry, skips its own fetch, and renders the chat
		// as empty even though the API returned rows. An empty real chat just
		// re-fetches on the next mount and lands back here, so the false miss is
		// cheap.
		if (loading || messages.length === 0) return;
		rememberChat(cache, prevId, {
			messages,
			pinnedMessages,
			hasMore,
			nextCursor,
			scrollPosition: scroll.pinnedToBottom ? null : scroll.distanceFromBottom,
		});
	}

	/** Nothing waiting means nothing to acknowledge — see `hasUnreadOnOpen`. */
	function markReadOnOpen(cur: string) {
		if (options.hasUnreadOnOpen?.(cur) === false) return;
		service.markRead(cur).catch(() => {});
	}

	async function load() {
		const cur = id;
		const cached = cache.get(cur);
		if (cached) {
			cache.delete(cur);
			messages = cached.messages;
			pinnedMessages = cached.pinnedMessages;
			hasMore = cached.hasMore;
			nextCursor = cached.nextCursor;
			loading = false;
			markReadOnOpen(cur);
			options.onLoaded?.();
			await tick();
			if (cached.scrollPosition === null) scroll.toBottom();
			else scroll.restoreDistanceFromBottom(cached.scrollPosition);
			return;
		}

		loading = true;
		try {
			const res = await service.getMessages(cur, { limit: 50 });
			messages = res.messages;
			hasMore = res.hasMore;
			nextCursor = res.nextCursor;
			markReadOnOpen(cur);
			void loadPinned();
			options.onLoaded?.();
			await tick();
			scroll.toBottom();
		} catch (err) {
			console.error('[useChatPanel] load failed', err);
			toasts.error(t.chat.loadFailed);
		} finally {
			loading = false;
		}
	}

	async function loadPinned() {
		try {
			const res = await service.getPinned(id);
			pinnedMessages = res.messages;
		} catch (err) {
			console.error('[useChatPanel] loadPinned failed', err);
		}
	}

	// Switching conversations: bank the old one, blank the view, fetch the new.
	$effect(() => {
		const cur = id;
		if (!cur) return;
		untrack(() => {
			saveToCache();
			prevId = cur;
			selection.clear();
			messages = [];
			pinnedMessages = [];
			hasMore = false;
			nextCursor = null;
			void load();
		});
	});

	onMount(() => ws.on(handleWs));

	onDestroy(saveToCache);

	// ─── Live updates ─────────────────────────────────────────

	function handleWs(raw: WsEvent) {
		const e = options.matchEvent(raw);
		if (!e) return;
		const next = applyChatEvent({ messages, pinnedMessages }, e);
		if (!next) return;
		messages = next.messages;
		pinnedMessages = next.pinnedMessages;

		// What the event does to the view, as opposed to the data.
		if (e.kind === 'deleted') selection.remove(e.messageId);
		if (e.kind !== 'message') return;

		options.onMessageReceived?.(e.message);
		if (!scroll.pinnedToBottom) return;
		tick().then(() => scroll.toBottom());
		// Only their messages need acknowledging, and only while we're actually
		// looking at the bottom of the conversation.
		if (e.message.authorId !== auth.user?.id) service.markRead(id).catch(() => {});
	}

	async function loadOlder() {
		if (!nextCursor || loadingOlder) return;
		loadingOlder = true;
		// Prepending rows would shove the view down by their height; pin the row
		// that was on top and restore its screen position afterwards.
		const anchorId = messages[0]?.id;
		try {
			const res = await service.getMessages(id, { cursor: nextCursor, limit: 50 });
			messages = mergeWindow(messages, res.messages, 'older');
			hasMore = res.hasMore;
			nextCursor = res.nextCursor;
			scroll.restoreAnchor(anchorId);
		} catch (err) {
			console.error('[useChatPanel] loadOlder failed', err);
		} finally {
			loadingOlder = false;
		}
	}

	/** A pinned message can be off-screen: this surface only has what's loaded. */
	function jumpToMessage(messageId: string) {
		if (!scroll.jumpTo(messageId)) toasts.error(t.chat.messageNotInView);
	}

	// ─── The pinned bar ───────────────────────────────────────
	// The bar itself is rendered by the app-wide stack (AppBars.svelte); this
	// surface only supplies the data while it's the one on screen.
	$effect(() =>
		pinnedBar.claim({
			pinned: pinnedMessages as never,
			onjump: jumpToMessage,
			onunpin: (messageId: string) => void actions.unpin(messageId),
		}),
	);

	return {
		get messages() { return messages; },
		get loading() { return loading; },
		get loadingOlder() { return loadingOlder; },
		get pinnedToBottom() { return scroll.pinnedToBottom; },
		get container() { return scroll.element; },
		set container(el: HTMLElement | null) { scroll.element = el; },
		selection,

		handleScroll: scroll.onScroll,
		scrollToBottom: scroll.toBottom,
		jumpToMessage,

		// Doing things to messages is its own hook; the panel just passes it on.
		send: actions.send,
		sendVoice: actions.sendVoice,
		deleteMessage: actions.deleteMessage,
		deleteSelected: actions.deleteSelected,
		editMessage: actions.editMessage,
		pin: actions.pin,
		unpin: actions.unpin,
		react: actions.react,
		forward: actions.forward,
	};
}
