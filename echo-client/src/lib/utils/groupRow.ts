import type { GroupListItem } from '$lib/stores/groups.svelte.js';

type LastMessage = NonNullable<GroupListItem['lastMessage']>;

/**
 * The author's display name, from whichever shape we were handed. The listing
 * endpoint flattens `authorUsername` / `authorDisplayName` onto the row; a
 * socket-pushed `GroupMessage` nests them under `author`. Either is welcome —
 * the sidebar only wants a string.
 */
export function authorNameOf(m: LastMessage): string {
	const nested = m as { author?: { displayName: string | null; username: string } };
	if (nested.author) {
		return (nested.author.displayName?.trim() || nested.author.username || '').trim();
	}
	const flat = m as { authorDisplayName?: string | null; authorUsername?: string };
	return (flat.authorDisplayName?.trim() || flat.authorUsername || '').trim();
}

/**
 * The "Name: " that precedes a group's last message in the sidebar, so the list
 * can be scanned for who said what without opening anything. Dropped for my own
 * messages and for system events, where a name would be noise.
 */
export function authorPrefix(m: LastMessage | null | undefined, myUserId: string | undefined): string {
	if (!m || m.systemKind || m.authorId === myUserId) return '';
	const name = authorNameOf(m);
	return name ? `${name}: ` : '';
}
