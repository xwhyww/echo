import { goto } from '$app/navigation';

/**
 * Leave the current page the way the back affordance means it: step back through
 * history when there is history to step through, and fall back to an explicit
 * destination when there isn't — a deep link or a reload lands on a page with
 * nothing behind it.
 *
 * Shared so the back button and the back gesture can never drift apart.
 *
 * `exact` turns the fallback into the rule: always this destination, whatever
 * history says. For screens reachable from several places whose arrow means "up
 * one level" rather than "undo the last navigation" — a voice channel belongs to
 * its group whether you arrived from the channel list, a sidebar or a link, and
 * the arrow should say so every time.
 */
export function goBack(backHref: string, opts?: { exact?: boolean }) {
	if (!opts?.exact && history.length > 1) {
		history.back();
	} else {
		goto(backHref);
	}
}
