import type { PersonalMessage } from '$lib/api/personalChats.js';

/** The bits of a user these helpers need — either party of the conversation. */
export interface ChatParty {
	id: string;
	username: string;
	displayName?: string | null;
	avatarUrl?: string | null;
}

export interface SeenEntry {
	userId: string;
	name: string;
	avatarUrl: string | null;
	seenAt: string;
}

function nameOf(p: ChatParty): string {
	return p.displayName ?? p.username;
}

/**
 * A personal chat has exactly one reader, so "read" means their last-read mark
 * has passed this message. Only ever true of my own messages — a message I
 * received is not something the other person "read".
 */
export function isReadByCompanion(
	msg: PersonalMessage,
	myUserId: string | undefined,
	otherLastReadAt: string | null,
): boolean {
	if (!myUserId || msg.authorId !== myUserId || !otherLastReadAt) return false;
	return new Date(msg.createdAt) <= new Date(otherLastReadAt);
}

/**
 * The one-entry seen-by list the context menu shows. A per-message receipt wins
 * over the conversation-wide last-read mark when the server sent one.
 */
export function seenByCompanion(
	msg: PersonalMessage,
	myUserId: string | undefined,
	companion: ChatParty | null,
	otherLastReadAt: string | null,
): SeenEntry[] {
	if (!companion || !myUserId || msg.authorId !== myUserId) return [];
	const seenAt = msg.readAt ?? (isReadByCompanion(msg, myUserId, otherLastReadAt) ? otherLastReadAt : null);
	if (!seenAt) return [];
	return [{
		userId: companion.id,
		name: nameOf(companion),
		avatarUrl: companion.avatarUrl ?? null,
		seenAt,
	}];
}

/**
 * Who reacted, resolved against the only two people who can be in this
 * conversation.
 */
export function personalReactorLookup(
	userId: string,
	me: ChatParty | null,
	companion: ChatParty | null,
): { name: string; avatarUrl: string | null } | null {
	for (const p of [me, companion]) {
		if (p && p.id === userId) return { name: nameOf(p), avatarUrl: p.avatarUrl ?? null };
	}
	return null;
}
