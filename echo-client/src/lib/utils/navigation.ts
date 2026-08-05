import { goto } from '$app/navigation';

/**
 * Leave the current page the way the back affordance means it: step back through
 * history when there is history to step through, and fall back to an explicit
 * destination when there isn't — a deep link or a reload lands on a page with
 * nothing behind it.
 *
 * Shared so the back button and the back gesture can never drift apart.
 */
export function goBack(backHref: string) {
	if (history.length > 1) {
		history.back();
	} else {
		goto(backHref);
	}
}
