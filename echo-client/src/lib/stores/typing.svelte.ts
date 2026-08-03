import { auth } from './auth.svelte.js';
import { ws } from './ws.svelte.js';

const TYPING_TIMEOUT = 5000;

type TypingUser = { userId: string; username: string };
type TypingEntry = TypingUser & { timeout: ReturnType<typeof setTimeout> };

// chatId -> userId -> entry (non-reactive backing store)
const typingMap = new Map<string, Map<string, TypingEntry>>();

// Reactive snapshot consumed by the UI — replaced wholesale on every change.
let typingByChat = $state<Record<string, TypingUser[]>>({});

function publish() {
	const next: Record<string, TypingUser[]> = {};
	for (const [chatId, users] of typingMap) {
		if (users.size > 0) {
			next[chatId] = [...users.values()].map((u) => ({ userId: u.userId, username: u.username }));
		}
	}
	typingByChat = next;
}

function noteTyping(chatId: string, userId: string, username: string) {
	let users = typingMap.get(chatId);
	if (!users) {
		users = new Map();
		typingMap.set(chatId, users);
	}
	const existing = users.get(userId);
	if (existing) clearTimeout(existing.timeout);
	const timeout = setTimeout(() => clearTyping(chatId, userId), TYPING_TIMEOUT);
	users.set(userId, { userId, username, timeout });
	publish();
}

function clearTyping(chatId: string, userId: string) {
	const users = typingMap.get(chatId);
	if (!users) return;
	const entry = users.get(userId);
	if (!entry) return;
	clearTimeout(entry.timeout);
	users.delete(userId);
	if (users.size === 0) typingMap.delete(chatId);
	publish();
}

ws.on((event) => {
	if (event.type === 'typing') {
		if (event.userId === auth.user?.id) return;
		noteTyping(event.chatId, event.userId, event.username);
	} else if (event.type === 'dm') {
		// A message from the author ends their typing state immediately.
		clearTyping(event.chatId, event.message.authorId);
	}
});

export const typingStore = {
	getUsersForChat(chatId: string): TypingUser[] {
		return typingByChat[chatId] ?? [];
	},
};
