import { onDestroy } from 'svelte';
import { personalChatsService } from '$lib/api/personalChatsService.js';

/**
 * Whether the conversation counts as read, and how much is waiting below the
 * viewport.
 *
 * Two rules were spread over five call sites and had to agree at every one of
 * them, or the chat would clear its unread badge while messages the reader has
 * never seen sat just out of view:
 *
 * - a chat is only *read* when the reader is at the end of it **and** there is
 *   nothing further below still unfetched — being pinned to the bottom of a
 *   window from the middle of the history is not the end of anything;
 * - telling the server so only counts while the window is actually visible,
 *   hence the `visibilitychange` listener rather than a single check.
 */
export function useDmReadState(options: {
	chatId: () => string | null;
	hasNewer: () => boolean;
	pinnedToBottom: () => boolean;
}) {
	let newMessagesBelow = $state(0);

	function isAppFocused(): boolean {
		return typeof document !== 'undefined' && document.visibilityState === 'visible';
	}

	/** At the end of the conversation, with nothing unloaded past it. */
	function atEnd(): boolean {
		return options.pinnedToBottom() && !options.hasNewer();
	}

	function markIfFocused() {
		const id = options.chatId();
		if (id && isAppFocused()) personalChatsService.markAsRead(id).catch(() => {});
	}

	/** Nothing below anymore: drop the counter and say so. */
	function catchUp() {
		newMessagesBelow = 0;
		markIfFocused();
	}

	// Coming back to a tab that was already sitting at the end marks it read;
	// this is the only path that isn't triggered by the reader doing something.
	function onVisibilityChange() {
		if (atEnd()) markIfFocused();
	}

	if (typeof document !== 'undefined') {
		document.addEventListener('visibilitychange', onVisibilityChange);
	}

	onDestroy(() => {
		if (typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', onVisibilityChange);
		}
	});

	return {
		get count() { return newMessagesBelow; },
		/** A message arrived somewhere the reader isn't looking. */
		noteArrival(n = 1) { newMessagesBelow += n; },
		/** Scrolled: catching up with the end is what marks a chat read. */
		noteScroll() { if (newMessagesBelow > 0 && atEnd()) catchUp(); },
		catchUp,
		markIfFocused,
		/** Jumped to the bottom, or switched chats — the count means nothing now. */
		clear() { newMessagesBelow = 0; },
	};
}
