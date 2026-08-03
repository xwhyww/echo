/**
 * One row of the "who saw this" / "who reacted" flyout. Both lists render the
 * same way — a face, a name, a time — so they share a shape and a component;
 * only reactions carry an emoji.
 */
export type PersonRow = {
	userId: string;
	name: string;
	avatarUrl: string | null;
	/** ISO timestamp of the read or the reaction. */
	at: string;
	emoji?: string;
};

/**
 * Timestamps inside the message menu: bare time today, "yesterday at …"
 * yesterday, day and month before that. `yesterdayAt` comes from the caller's
 * dictionary so this stays free of i18n, and `now` is injectable so the
 * boundaries are testable.
 */
export function formatSeenAt(
	iso: string,
	yesterdayAt: (time: string) => string,
	now: Date = new Date(),
): string {
	const d = new Date(iso);
	const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

	if (d.toDateString() === now.toDateString()) return time;

	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);
	if (d.toDateString() === yesterday.toDateString()) return yesterdayAt(time);

	return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}
