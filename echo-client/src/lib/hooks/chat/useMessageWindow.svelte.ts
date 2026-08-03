import type { PersonalMessage } from '$lib/api/personalChats.js';
import { mergeWindow, trimWindow } from '$lib/utils/messageWindow.js';

/**
 * A page as the message endpoints return it. The optional fields are the ones
 * not every endpoint sends: `getMessagesAfter` knows nothing about the older
 * edge, and `hasMore` is the older `hasOlder` under its previous name.
 */
export interface MessagePage {
	messages: PersonalMessage[];
	hasOlder?: boolean;
	hasNewer?: boolean;
	hasMore?: boolean;
	nextCursor?: string | null;
	newerCursor?: string | null;
}

/** What the warm cache keeps of a window — the five fields that describe it. */
export interface MessageWindowSnapshot {
	messages: PersonalMessage[];
	hasOlder: boolean;
	hasNewer: boolean;
	nextCursor: string | null;
	newerCursor: string | null;
}

/**
 * The window of a conversation: the messages on screen and, at each end, both
 * "is there more that way" and "from where to resume".
 *
 * Those five fields only ever move together — a page arriving updates the
 * messages, the flag and the cursor of one side at once — and getting one of
 * them out of step with the others is how a chat ends up refusing to load its
 * own history. They were set field by field at seven call sites; here each of
 * those is one call.
 */
export function useMessageWindow(max: number) {
	let messages = $state<PersonalMessage[]>([]);
	let hasOlder = $state(false);
	let hasNewer = $state(false);
	let nextCursor = $state<string | null>(null);
	let newerCursor = $state<string | null>(null);

	/**
	 * Caps the window, dropping from the far side. Whatever was dropped is now
	 * "more, that way", which is why trimming sets the flag and the cursor of
	 * the side it dropped from.
	 */
	function trim(side: 'top' | 'bottom') {
		const trimmed = trimWindow(messages, side, max);
		if (!trimmed) return;
		messages = trimmed.messages;
		if (side === 'top') {
			hasOlder = true;
			if (trimmed.cursor) nextCursor = trimmed.cursor;
		} else {
			hasNewer = true;
			if (trimmed.cursor) newerCursor = trimmed.cursor;
		}
	}

	return {
		get messages() { return messages; },
		set messages(next: PersonalMessage[]) { messages = next; },
		get hasOlder() { return hasOlder; },
		get hasNewer() { return hasNewer; },
		get nextCursor() { return nextCursor; },
		get newerCursor() { return newerCursor; },

		/** Empty, with nothing known about either end — a chat about to load. */
		reset() {
			messages = [];
			hasOlder = false;
			hasNewer = false;
			nextCursor = null;
			newerCursor = null;
		},

		/** A window loaded from scratch: this page is now the whole of it. */
		replace(page: MessagePage) {
			messages = page.messages;
			hasOlder = page.hasOlder ?? page.hasMore ?? false;
			hasNewer = page.hasNewer ?? false;
			nextCursor = page.nextCursor ?? null;
			newerCursor = page.newerCursor ?? null;
		},

		/**
		 * Grows the window at one end and trims the other, and reports how many
		 * messages actually arrived — a page can be entirely made of messages
		 * already here, which is not the same as an empty one.
		 */
		extend(page: MessagePage, side: 'older' | 'newer'): number {
			const merged = mergeWindow(messages, page.messages, side);
			const arrived = merged.length - messages.length;
			messages = merged;
			if (side === 'older') {
				hasOlder = page.hasOlder ?? page.hasMore ?? false;
				nextCursor = page.nextCursor ?? null;
				trim('bottom');
			} else {
				hasNewer = page.hasNewer ?? false;
				newerCursor = page.newerCursor ?? null;
				trim('top');
			}
			return arrived;
		},

		/** One message onto the end — sent here, or arrived over the socket. */
		push(message: PersonalMessage) {
			messages = [...messages, message];
			trim('top');
		},

		snapshot(): MessageWindowSnapshot {
			return { messages, hasOlder, hasNewer, nextCursor, newerCursor };
		},

		restore(cached: MessageWindowSnapshot) {
			messages = cached.messages;
			hasOlder = cached.hasOlder;
			hasNewer = cached.hasNewer;
			nextCursor = cached.nextCursor;
			newerCursor = cached.newerCursor;
		},
	};
}
