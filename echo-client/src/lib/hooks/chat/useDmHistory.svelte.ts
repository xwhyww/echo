import { personalChatsService } from '$lib/api/personalChatsService.js';
import { useMessageWindow, type MessagePage } from '$lib/hooks/chat/useMessageWindow.svelte.js';

/** A page that also carries the companion's read marker. */
export interface DmPage extends MessagePage {
	otherLastReadAt: string | null;
}

/**
 * Fetching a personal conversation, in every direction it can be fetched.
 *
 * The window and the five loaders were always one thing: each loader exists to
 * move one of the window's edges, and every one of them has the same three
 * parts — a guard that says whether it may run at all, the request, and the
 * merge. What each loader does *afterwards* is not the same, and that part
 * stays with the caller: restoring the scroll anchor, marking the chat read,
 * counting what arrived while the reader was elsewhere. So these return what
 * happened rather than acting on the view.
 *
 * The abort controller lives here too, because everything it cancels does.
 */
export function useDmHistory(chatId: () => string | null, maxMessages: number) {
	const win = useMessageWindow(maxMessages);

	let loading = $state(true);
	let loadingOlder = $state(false);
	let loadingNewer = $state(false);
	/** The first page is in. Until then every other loader must stay out. */
	let ready = $state(false);

	let controller: AbortController | null = null;

	function abort() {
		if (controller) {
			controller.abort();
			controller = null;
		}
	}

	/** Cancels whatever the previous conversation still had in flight. */
	function newSignal(): AbortSignal {
		abort();
		controller = new AbortController();
		return controller.signal;
	}

	/**
	 * The newest page, becoming the whole window. Throws rather than swallowing:
	 * only the caller can tell an abort (a newer load already running, so it must
	 * not report itself finished) from a chat that doesn't exist yet.
	 */
	async function loadNewest(id: string, signal: AbortSignal): Promise<DmPage> {
		const res = await personalChatsService.getMessages(id, undefined, signal);
		win.replace(res);
		return res;
	}

	/** True when a page was actually fetched and merged. */
	async function loadOlder(): Promise<boolean> {
		const id = chatId();
		if (!id || !win.hasOlder || !win.nextCursor || loadingOlder || !ready) return false;
		loadingOlder = true;
		try {
			const res = await personalChatsService.getMessages(id, win.nextCursor, controller?.signal);
			win.extend(res, 'older');
			return true;
		} catch {
			return false;
		} finally {
			loadingOlder = false;
		}
	}

	async function loadNewer(): Promise<boolean> {
		const id = chatId();
		if (!id || !win.hasNewer || !win.newerCursor || loadingNewer || !ready) return false;
		loadingNewer = true;
		try {
			const res = await personalChatsService.getMessagesAfter(id, win.newerCursor, undefined, controller?.signal);
			win.extend(res, 'newer');
			return true;
		} catch {
			return false;
		} finally {
			loadingNewer = false;
		}
	}

	/**
	 * After the socket dropped: everything since the last message we hold.
	 * Returns how many actually arrived — nothing having arrived is the common
	 * case and means the view has nothing to do.
	 */
	async function fillGap(): Promise<number> {
		const id = chatId();
		if (!id || !ready) return 0;
		// Reading history means there is already a gap below on purpose; it gets
		// filled by jumping to the bottom, not behind the reader's back.
		if (win.hasNewer) return 0;
		const last = win.messages.at(-1);
		if (!last) return 0;
		try {
			const res = await personalChatsService.getMessagesAfter(id, last.createdAt, undefined, controller?.signal);
			return win.extend(res, 'newer');
		} catch {
			// ignore — will retry on next reconnect
			return 0;
		}
	}

	/** Back to the end of the conversation, dropping the historical window. */
	async function jumpToNewest(): Promise<boolean> {
		const id = chatId();
		if (!id) return false;
		loading = true;
		let arrived = false;
		try {
			const res = await personalChatsService.getMessages(id, undefined, controller?.signal);
			// The newest page by definition, so nothing below it whatever the
			// response says.
			win.replace({ ...res, hasNewer: false, newerCursor: null });
			arrived = true;
		} catch {
			// ignore
		}
		loading = false;
		return arrived;
	}

	/**
	 * The window around one message, for a link into the middle of the history.
	 * `null` means the message isn't there — asked *before* anything on screen
	 * changes, so a bad link disturbs nothing.
	 */
	async function loadAround(messageId: string): Promise<DmPage | null> {
		const id = chatId();
		if (!id) return null;
		try {
			return await personalChatsService.getMessagesAround(id, messageId);
		} catch {
			return null;
		}
	}

	/** Applies a window fetched by `loadAround` once the caller has committed. */
	function showAround(page: DmPage) {
		win.replace(page);
	}

	return {
		/** The messages on screen and both of the window's edges. */
		window: win,

		get loading() { return loading; },
		set loading(v: boolean) { loading = v; },
		get loadingOlder() { return loadingOlder; },
		get loadingNewer() { return loadingNewer; },
		get ready() { return ready; },
		set ready(v: boolean) { ready = v; },

		abort,
		newSignal,
		loadNewest,
		loadOlder,
		loadNewer,
		fillGap,
		jumpToNewest,
		loadAround,
		showAround,

		/** A different conversation is opening: nothing known, nothing in flight. */
		reset() {
			abort();
			win.reset();
			loading = true;
			ready = false;
		},
	};
}
