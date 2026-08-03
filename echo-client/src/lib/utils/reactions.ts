import type { MessageReaction } from '$lib/api/personalChats.js';

/**
 * What the reaction row should look like the instant someone clicks, before the
 * server has answered: their previous reaction taken back, the new one added.
 * `emoji: null` means they are only taking theirs back.
 *
 * A reaction carries three parallel pieces — `userIds`, `reactedAts` and
 * `count` — that have to stay aligned, which is the whole reason this is one
 * function and not a few lines at each call site. An emoji nobody is left on
 * disappears rather than lingering at zero.
 */
export function optimisticReactions(
	current: MessageReaction[] | undefined,
	userId: string,
	emoji: string | null,
): MessageReaction[] {
	const now = new Date().toISOString();

	const withoutMine = (current ?? [])
		.map((r) => {
			const kept = r.userIds
				.map((id, i) => ({ id, at: r.reactedAts?.[i] ?? now }))
				.filter((x) => x.id !== userId);
			return {
				...r,
				userIds: kept.map((x) => x.id),
				reactedAts: kept.map((x) => x.at),
				count: kept.length,
			};
		})
		.filter((r) => r.count > 0);

	if (!emoji) return withoutMine;

	const existing = withoutMine.find((r) => r.emoji === emoji);
	if (!existing) {
		return [...withoutMine, { emoji, count: 1, userIds: [userId], reactedAts: [now] }];
	}
	return withoutMine.map((r) =>
		r === existing
			? {
				...r,
				userIds: [...r.userIds, userId],
				reactedAts: [...r.reactedAts, now],
				count: r.userIds.length + 1,
			}
			: r,
	);
}

/** One person's reaction, as the context menu lists them. */
export interface ReactorRow {
	userId: string;
	name: string;
	avatarUrl: string | null;
	emoji: string;
	reactedAt: string;
}

/**
 * Flattens the reactions into one list of people, oldest first.
 *
 * Same three parallel pieces as above, read rather than written: `userIds[i]`
 * and `reactedAts[i]` describe one person, so the loop walks them by index and
 * drops any pair that isn't whole — a reactor we can't name or time is one we
 * can't render a row for.
 */
export function reactorRows(
	reactions: MessageReaction[],
	lookup: ((userId: string) => { name: string; avatarUrl: string | null } | null) | undefined,
): ReactorRow[] {
	const rows: ReactorRow[] = [];
	for (const r of reactions) {
		for (let i = 0; i < r.userIds.length; i++) {
			const userId = r.userIds[i];
			const reactedAt = r.reactedAts?.[i];
			const info = lookup?.(userId);
			if (!reactedAt || !info) continue;
			rows.push({ userId, name: info.name, avatarUrl: info.avatarUrl, emoji: r.emoji, reactedAt });
		}
	}
	rows.sort((a, b) => a.reactedAt.localeCompare(b.reactedAt));
	return rows;
}
