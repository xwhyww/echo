/**
 * Every clock and calendar string in the app, formatted against the *app's*
 * language rather than the browser's.
 *
 * The distinction matters: `toLocaleTimeString()` with no locale — or with
 * `[]`, which means the same thing — asks the browser, so a Russian UI on an
 * en-US machine renders "12:58 AM" next to Cyrillic text. Passing `i18n.locale`
 * makes the hour cycle follow the language the user actually picked: ru gives
 * 14:58, en gives 2:58 PM.
 *
 * Pure and rune-free (§3): components pass the locale in, they don't reach for
 * the store from here.
 */

/**
 * `Intl.DateTimeFormat` construction is the expensive part — the formatting
 * itself is cheap — and a sidebar of chats reformats a timestamp per row on
 * every render. Same handful of shapes every time, so build each once.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const key = `${locale}|${JSON.stringify(opts)}`;
	let f = formatters.get(key);
	if (!f) {
		f = new Intl.DateTimeFormat(locale, opts);
		formatters.set(key, f);
	}
	return f;
}

/** Parsed, or null when the string isn't a date we can render. */
function parse(iso: string): Date | null {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? null : d;
}

function format(iso: string, locale: string, opts: Intl.DateTimeFormatOptions): string {
	const d = parse(iso);
	return d ? formatter(locale, opts).format(d) : '';
}

/** Clock time: `14:58` in ru, `2:58 PM` in en. */
export function formatTime(iso: string, locale: string): string {
	return format(iso, locale, { hour: '2-digit', minute: '2-digit' });
}

/** Day and abbreviated month: `10 авг.` / `10 Aug`. */
export function formatDayMonth(iso: string, locale: string): string {
	return format(iso, locale, { day: 'numeric', month: 'short' });
}

/** Abbreviated weekday, for timestamps inside the last week: `вт` / `Tue`. */
export function formatWeekday(iso: string, locale: string): string {
	return format(iso, locale, { weekday: 'short' });
}

/** All-numeric day and month, the most compact a full date gets: `10.08`. */
export function formatDayMonthNumeric(iso: string, locale: string): string {
	return format(iso, locale, { day: '2-digit', month: '2-digit' });
}

/** Date and time in full — the long form behind a `title` tooltip. */
export function formatDateTime(iso: string, locale: string): string {
	return format(iso, locale, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Date alone, no time: `10 авг. 2025 г.` / `Aug 10, 2025`. */
export function formatDate(iso: string, locale: string): string {
	return format(iso, locale, { dateStyle: 'medium' });
}

/** Whether two instants fall on the same local calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}
