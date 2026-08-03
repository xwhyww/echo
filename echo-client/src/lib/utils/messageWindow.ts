import type { PersonalMessage } from '$lib/api/personalChats.js';

/**
 * A personal chat holds a *window* of the conversation, not all of it: opening a
 * link to an old message loads the messages around it, with more to fetch in
 * both directions. These are the two things that happen at the window's edges.
 */

/**
 * Adds a fetched page to the window, dropping anything already there — the same
 * message can arrive twice, once over the socket and once in a page whose
 * cursor straddles it.
 *
 * Generic over anything with an id: the group and voice surfaces page the same
 * way over their own message type, and had their own copy of this.
 */
export function mergeWindow<T extends { id: string }>(
	existing: T[],
	incoming: T[],
	side: 'older' | 'newer',
): T[] {
	const have = new Set(existing.map((m) => m.id));
	const fresh = incoming.filter((m) => !have.has(m.id));
	if (fresh.length === 0) return existing;
	return side === 'older' ? [...fresh, ...existing] : [...existing, ...fresh];
}

/**
 * Caps the window by dropping from the far end, and reports the cursor to
 * resume from — the timestamp of the message now at the edge, so what was
 * dropped can be fetched back when the reader scrolls that way again.
 *
 * `null` when nothing had to go. The caller sets its own "there is more that
 * way" flag: trimming is exactly what makes that true.
 */
export function trimWindow(
	messages: PersonalMessage[],
	side: 'top' | 'bottom',
	max: number,
): { messages: PersonalMessage[]; cursor: string | null } | null {
	if (messages.length <= max) return null;
	const kept =
		side === 'top' ? messages.slice(messages.length - max) : messages.slice(0, max);
	const edge = side === 'top' ? kept[0] : kept.at(-1);
	return { messages: kept, cursor: edge?.createdAt ?? null };
}
