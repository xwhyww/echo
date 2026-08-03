/** How many conversations to keep warm before evicting the oldest. */
export const CHAT_CACHE_LIMIT = 50;

/**
 * Writes one conversation into the warm cache, oldest evicted first.
 *
 * A `Map` iterates in insertion order, so the eviction order is simply its key
 * order — provided every write re-inserts. Hence the delete before the set: an
 * update to an entry that is already there has to move it to the end, or a
 * conversation you keep returning to would age out while one you opened once
 * and abandoned survives.
 */
export function rememberChat<TEntry>(
	cache: Map<string, TEntry>,
	id: string,
	entry: TEntry,
	limit = CHAT_CACHE_LIMIT,
): void {
	cache.delete(id);
	cache.set(id, entry);
	if (cache.size > limit) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
}
