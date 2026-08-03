import type { PersonalChat, PersonalChatUser } from '$lib/api/personalChats.js';
import { personalChatsService } from '$lib/api/personalChatsService.js';

let chats = $state<PersonalChat[]>([]);
let tempChat = $state<PersonalChat | null>(null);
let loaded = $state(false);
let hasMore = $state(false);
let nextCursor = $state<string | null>(null);
let loadingMore = $state(false);

/** In-flight first load, so concurrent callers share one request. */
let loadPromise: Promise<void> | null = null;

export const personalChatsStore = {
	get list() { return chats; },
	set list(value: PersonalChat[]) { chats = value; loaded = true; },
	get loaded() { return loaded; },
	/**
	 * Fetches the chat list once. Anything that needs the list has to call this
	 * rather than wait for `loaded` — the chat sidebar that used to be the only
	 * loader isn't mounted on the fullscreen chat routes, so a direct load of
	 * /chats/perschat/[id] would otherwise wait forever. Callers gate on auth.
	 */
	ensureLoaded() {
		if (loaded) return Promise.resolve();
		if (loadPromise) return loadPromise;
		loadPromise = (async () => {
			try {
				const res = await personalChatsService.getAll({});
				personalChatsStore.list = res.chats;
				hasMore = res.hasMore;
				nextCursor = res.nextCursor;
			} catch {
				console.error('Load chats request error');
			} finally {
				loadPromise = null;
			}
		})();
		return loadPromise;
	},
	get hasMore() { return hasMore; },
	set hasMore(value: boolean) { hasMore = value; },
	get nextCursor() { return nextCursor; },
	set nextCursor(value: string | null) { nextCursor = value; },
	get loadingMore() { return loadingMore; },
	set loadingMore(value: boolean) { loadingMore = value; },
	append(newChats: PersonalChat[]) {
		const existingIds = new Set(chats.map((c) => c.id));
		chats = [...chats, ...newChats.filter((c) => !existingIds.has(c.id))];
	},
	/**
	 * A message just went to this person: refresh their row, or add one if this
	 * is the first thing ever said to them. Sending and forwarding both land
	 * here — a forward to someone you've never written to has to create the row
	 * exactly as a first message does.
	 */
	noteOutgoing(
		chatId: string,
		user: PersonalChatUser,
		lastMessage: import('$lib/api/personalChats.js').LastMessage,
	) {
		if (chats.some((c) => c.user.id === user.id)) {
			personalChatsStore.updateLastMessage(chatId, lastMessage, false);
			return;
		}
		chats = [
			{ id: chatId, user, lastMessage, unreadCount: 0, createdAt: new Date().toISOString() },
			...chats,
		];
	},
	get tempChat() { return tempChat },
	findByUsername(username: string) {
		return chats.find((c) => c.user.username === username);
	},
	findByUserId(userId: string) {
		return chats.find((c) => c.user.id === userId);
	},
	addTemp(user: PersonalChatUser) {
		tempChat = {
			id: `temp-${user.username}`,
			temp: true,
			user,
			lastMessage: null,
			unreadCount: 0,
			createdAt: new Date().toISOString(),
		};
	},
	removeTemp() {
		tempChat = null
	},
	updateLastMessage(chatId: string, lastMessage: import('$lib/api/personalChats.js').LastMessage, isLastMessageRead?: boolean | null) {
		const updated = chats.map((c) =>
			c.id === chatId
				? {
					...c,
					lastMessage,
					...(isLastMessageRead !== undefined
						? { isLastMessageRead, lastMessageReadAt: null }
						: {}),
				}
				: c
		);
		const idx = updated.findIndex((c) => c.id === chatId);
		if (idx > 0) {
			const [chat] = updated.splice(idx, 1);
			updated.unshift(chat);
		}
		chats = updated;
	},
	setUnseenReaction(chatId: string, reaction: import('$lib/api/personalChats.js').UnseenReaction | null) {
		chats = chats.map((c) => (c.id === chatId ? { ...c, unseenReaction: reaction } : c));
	},
	promoteTempToReal(realChatId?: string) {
		if (tempChat) {
			const promoted = realChatId ? { ...tempChat, id: realChatId } : tempChat;
			chats = [promoted, ...chats];
			tempChat = null;
		}
	},
	reset() {
		chats = [];
		tempChat = null;
		loaded = false;
		loadPromise = null;
		hasMore = false;
		nextCursor = null;
		loadingMore = false;
	},
};
