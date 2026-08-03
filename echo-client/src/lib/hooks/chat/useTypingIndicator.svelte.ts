import { ws } from '$lib/stores/ws.svelte.js';

/** How long a "typing" notice stands before it is assumed stale. */
const TYPING_TTL_MS = 5000;
/** No more than one outgoing notice per this long, however fast someone types. */
const SEND_THROTTLE_MS = 3000;

interface TypingUser {
	userId: string;
	username: string;
	timeout: ReturnType<typeof setTimeout>;
}

/**
 * Who is typing in this chat right now.
 *
 * The server sends a notice per burst of typing and nothing at all when someone
 * stops, so each entry carries its own expiry — which is why they're timeouts
 * and not timestamps: nothing polls, the list empties itself.
 */
export function useTypingIndicator(chatId: () => string | null) {
	let users = $state<TypingUser[]>([]);
	let lastSent = 0;

	function forget(userId: string) {
		users = users.filter((u) => u.userId !== userId);
	}

	function clearTimers() {
		for (const u of users) clearTimeout(u.timeout);
	}

	$effect(() => () => clearTimers());

	return {
		get users() { return users; },

		/** A notice arrived: start or extend this person's countdown. */
		track(userId: string, username: string) {
			const existing = users.find((u) => u.userId === userId);
			if (existing) {
				clearTimeout(existing.timeout);
				existing.timeout = setTimeout(() => forget(userId), TYPING_TTL_MS);
				return;
			}
			users = [
				...users,
				{ userId, username, timeout: setTimeout(() => forget(userId), TYPING_TTL_MS) },
			];
		},

		/** They just sent a message, so they are obviously no longer typing. */
		forget(userId: string) {
			const existing = users.find((u) => u.userId === userId);
			if (!existing) return;
			clearTimeout(existing.timeout);
			forget(userId);
		},

		/** Switching conversations: nobody in the old one is typing to us here. */
		reset() {
			clearTimers();
			users = [];
		},

		/** Tell the other side we're typing, at most every few seconds. */
		notify() {
			const id = chatId();
			if (!id) return;
			const now = Date.now();
			if (now - lastSent < SEND_THROTTLE_MS) return;
			lastSent = now;
			ws.send({ type: 'typing', chatId: id });
		},
	};
}
