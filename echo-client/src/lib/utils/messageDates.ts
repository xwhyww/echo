/**
 * The day dividers a message list draws between one calendar day and the next.
 * Pure and Svelte-free so the grouping can be unit-tested apart from the
 * scroller that renders it.
 *
 * Everything here works in the *viewer's* local day, not UTC: a message sent at
 * 23:30 in Moscow and read in London belongs to the day the reader is looking
 * at, which is the only day they can reason about.
 */

/** Labels the divider needs from the dictionary. Everything else is `Intl`'s. */
export interface DayDividerLabels {
	today: string;
	yesterday: string;
}

/**
 * Identity of the local calendar day an instant falls in. Only ever compared
 * against another key from this function — the format is an implementation
 * detail, not something to parse or display.
 */
export function dayKey(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * What the divider above the first message of a day reads: "Today" and
 * "Yesterday" for the two days a reader thinks of by name, "10 August" inside
 * the current year, and "10 August 2024" once the year stops being obvious.
 */
export function formatDayDivider(iso: string, locale: string, labels: DayDividerLabels): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';

	const now = new Date();
	const key = dayKey(iso);
	if (key === dayKey(now.toISOString())) return labels.today;

	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);
	if (key === dayKey(yesterday.toISOString())) return labels.yesterday;

	return d.toLocaleDateString(locale, {
		day: 'numeric',
		month: 'long',
		...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
	});
}

/**
 * One entry per message, in step with the list: the divider label to draw
 * *above* that message, or null when it continues the previous one's day. The
 * caller indexes this by the row's position rather than comparing neighbours
 * itself, so the first row always gets a divider and no row gets two.
 *
 * Expects the chronological order the chat renders in (oldest first).
 */
export function dayDividers(
	items: { createdAt: string }[],
	locale: string,
	labels: DayDividerLabels,
): (string | null)[] {
	let prev: string | null = null;
	return items.map((item) => {
		const key = dayKey(item.createdAt);
		const label = key && key !== prev ? formatDayDivider(item.createdAt, locale, labels) : null;
		prev = key || prev;
		return label;
	});
}
