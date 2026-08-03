import type { PersonalMessage } from '$lib/api/personalChats.js';

export interface PinnedBarSource {
	pinned: PersonalMessage[];
	onjump: (messageId: string) => void;
	onunpin?: (messageId: string) => void;
}

/**
 * The pinned-messages bar is rendered by the app-wide bar stack, but the data
 * behind it belongs to whichever chat surface is currently open. That surface
 * publishes it here and the stack picks it up.
 *
 * Claims are token-owned so that navigating between two chats can't leave the
 * bar blank: the outgoing surface's cleanup runs *after* the incoming one has
 * already claimed, and releasing a claim you no longer hold is a no-op.
 */
let current = $state<PinnedBarSource | null>(null);
let owner: object | null = null;

export const pinnedBar = {
	get current() {
		return current;
	},
	/** Publish this surface's pinned messages. Returns a release function. */
	claim(source: PinnedBarSource): () => void {
		const token = {};
		owner = token;
		current = source;
		return () => {
			if (owner !== token) return;
			owner = null;
			current = null;
		};
	},
};
