import type { PersonalChatUser } from '$lib/api/personalChats.js';
import type { Group } from '$lib/api/groups.js';

/**
 * What the app header should show while a chat is open.
 *
 * The header is rendered by the root layout, but everything in it — who the
 * conversation is with, whether they are online, whether they are typing, how
 * many people are in the group — is owned by the chat page's hook. This is the
 * seam between them: the page publishes, `Header` renders, and neither has to
 * reach into the other.
 *
 * The alternative was leaving the header inside the page, where it had to float
 * over the scroller as fixed chrome. In the layout it is an ordinary flex child
 * above the page, which is what every other screen's header already is.
 */
export interface PersonalChatHeaderState {
	kind: 'personal';
	/** Null in the saved-messages chat, and until the chat has loaded. */
	companion: PersonalChatUser | null;
	isSelf: boolean;
	/** Falls back to the companion's own name while the chat is resolving. */
	title: string | null;
	typingUsers: { username: string }[];
	onopeninfo: () => void;
}

export interface GroupChatHeaderState {
	kind: 'group';
	/** Null until the group has loaded. */
	group: Group | null;
	memberCount: number;
	onopeninfo: () => void;
	/** The avatar is a target of its own: it opens the group's settings. */
	onopensettings: () => void;
}

export type ChatHeaderState = PersonalChatHeaderState | GroupChatHeaderState;

class ChatHeaderStore {
	/** Null on every screen that is not an open chat. */
	current = $state<ChatHeaderState | null>(null);

	set(state: ChatHeaderState) {
		this.current = state;
	}

	clear() {
		this.current = null;
	}
}

export const chatHeader = new ChatHeaderStore();
