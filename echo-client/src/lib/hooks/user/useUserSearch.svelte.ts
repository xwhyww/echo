import { ApiError } from '$lib/api/client.js';
import type { User as UserType } from '$lib/api/auth.js';
import { userService } from '$lib/api/userService.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';

export function useUserSearch() {
	let query = $state('');
	let results = $state<UserType[]>([]);
	let searching = $state(false);
	let searched = $state(false);
	let error = $state('');
	let debounceTimer: ReturnType<typeof setTimeout>;

	function handleInput() {
		searched = false;
		error = '';
		results = [];

		clearTimeout(debounceTimer);

		if (query.trim().length < 2) return;

		debounceTimer = setTimeout(search, 400);
	}

	async function search() {
		if (query.trim().length < 2) return;

		searching = true;
		error = '';

		try {
			const data = await userService.search(query.trim());
			results = data.users;
		} catch (err) {
			if (err instanceof ApiError) {
				error = err.message;
			} else {
				error = i18n.t.errors.searchFailed;
			}
		} finally {
			searching = false;
			searched = true;
		}
	}

	return {
		get query() { return query; },
		set query(v: string) { query = v; },
		get results() { return results; },
		get searching() { return searching; },
		get searched() { return searched; },
		get error() { return error; },
		handleInput,
	};
}
