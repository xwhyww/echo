import { redirect } from '@sveltejs/kit';
import { HOME } from '$lib/routes.js';

// `/` is not a screen — it only ever hands over to the chat list. Redirecting in
// `load` means the home page never renders, so nothing flashes on the way.
export function load() {
	redirect(307, HOME);
}
