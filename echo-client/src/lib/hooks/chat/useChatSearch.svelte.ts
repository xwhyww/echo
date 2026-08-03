import { personalChatsService } from '$lib/api/personalChatsService.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';

type SearchHit = Awaited<
	ReturnType<typeof personalChatsService.searchMessages>
>['messages'][number];

/**
 * Searching inside one conversation. The panel opens over the message list, so
 * this owns both the query and whether the panel is showing — and resets itself
 * whenever the chat underneath changes.
 */
export function useChatSearch(chatId: () => string | null) {
	const t = $derived(i18n.t);
	const id = $derived(chatId());

	let open = $state(false);
	// Stays true after jumping to a hit, so the header can offer "show results"
	// instead of starting the search over.
	let hasResults = $state(false);
	let query = $state('');
	let results = $state<SearchHit[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	let lastSearched = '';
	let abort: AbortController | null = null;
	let debounce: ReturnType<typeof setTimeout> | null = null;

	function close() {
		open = false;
		hasResults = false;
		query = '';
		results = [];
		error = null;
		loading = false;
		lastSearched = '';
		abort?.abort();
		if (debounce) clearTimeout(debounce);
	}

	// Switching conversations invalidates everything on screen.
	let lastId: string | null = null;
	$effect(() => {
		if (id !== lastId) {
			lastId = id;
			close();
		}
	});

	$effect(() => {
		if (!open) return;
		const q = query.trim();
		const target = id;
		if (debounce) clearTimeout(debounce);
		abort?.abort();

		if (!target || !q) {
			results = [];
			loading = false;
			error = null;
			lastSearched = '';
			return;
		}

		// Re-running the same query would only replace the results with
		// themselves — and would fight the scroll-to-bottom effect.
		if (q === lastSearched) return;

		debounce = setTimeout(async () => {
			const ctrl = new AbortController();
			abort = ctrl;
			loading = true;
			error = null;
			try {
				const res = await personalChatsService.searchMessages(target, q, null, ctrl.signal);
				if (!ctrl.signal.aborted) {
					results = res.messages;
					lastSearched = q;
				}
			} catch (e) {
				if ((e as { name?: string })?.name !== 'AbortError') {
					error = t.errors.searchFailed;
					results = [];
				}
			} finally {
				if (abort === ctrl) loading = false;
			}
		}, 200);
	});

	// Newest last, matching the message list this panel sits over.
	const ordered = $derived([...results].reverse());

	return {
		get open() { return open; },
		get showingPanel() { return open && query.trim().length > 0; },
		get hasResults() { return hasResults; },
		get query() { return query; },
		set query(v: string) { query = v; },
		get results() { return ordered; },
		get loading() { return loading; },
		get error() { return error; },

		start() {
			open = true;
			hasResults = false;
		},
		close,
		/** Called once the caller has scrolled the message list to the hit. */
		jumped() {
			open = false;
			hasResults = results.length > 0;
		},
	};
}
