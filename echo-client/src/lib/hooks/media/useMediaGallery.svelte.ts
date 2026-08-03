import { goto } from '$app/navigation';
import { auth } from '$lib/stores/auth.svelte.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';
import type {
	MediaKind,
	MediaGalleryItem,
	MediaGalleryLink,
} from '$lib/utils/mediaGallery.js';

interface Page<T> {
	items: T[];
	nextCursor: string | null;
	hasMore: boolean;
}

/** Every tab except links, which comes from its own endpoint. */
type AttachmentKind = Exclude<MediaKind, 'links'>;

/**
 * Where a gallery's pages come from. Group and personal chats hit different
 * endpoints and key them differently — a group is its own id, a personal chat
 * has to be looked up from the companion's — so the page supplies this.
 */
export interface MediaSource {
	/** Route param → the id the media endpoints want. Null means "no such chat". */
	resolveId: (routeId: string) => Promise<string | null>;
	fetchMedia: (
		id: string,
		kind: AttachmentKind,
		cursor: string | null,
		signal?: AbortSignal,
	) => Promise<Page<MediaGalleryItem>>;
	fetchLinks: (
		id: string,
		cursor: string | null,
		signal?: AbortSignal,
	) => Promise<Page<MediaGalleryLink>>;
	/** Where switching tabs navigates to. */
	href: (routeId: string, kind: MediaKind) => string;
}

/**
 * The paginated media gallery behind both chat-media routes: resets on every
 * chat/kind change, aborts the in-flight page when it does, and reports the
 * three states the gallery renders from.
 */
export function useMediaGallery(
	routeId: () => string,
	kind: () => MediaKind,
	source: MediaSource,
) {
	const t = $derived(i18n.t);
	const id = $derived(routeId());
	const currentKind = $derived(kind());

	let resolvedId = $state<string | null>(null);
	let items = $state<MediaGalleryItem[]>([]);
	let linkItems = $state<MediaGalleryLink[]>([]);
	let cursor = $state<string | null>(null);
	let hasMore = $state(true);
	let loading = $state(false);
	let initialLoading = $state(true);
	let error = $state<string | null>(null);

	async function loadMore(signal?: AbortSignal) {
		const target = resolvedId;
		if (loading || !hasMore || !target) return;
		loading = true;
		try {
			if (currentKind === 'links') {
				const res = await source.fetchLinks(target, cursor, signal);
				if (signal?.aborted) return;
				linkItems = [...linkItems, ...res.items];
				cursor = res.nextCursor;
				hasMore = res.hasMore;
			} else {
				const res = await source.fetchMedia(target, currentKind, cursor, signal);
				if (signal?.aborted) return;
				items = [...items, ...res.items];
				cursor = res.nextCursor;
				hasMore = res.hasMore;
			}
		} catch (e) {
			if (!signal?.aborted) error = (e as Error)?.message || t.media.loadFailed;
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	// Re-init whenever the chat or kind changes. Guarded on auth.loading so we
	// don't fire requests before auth.init() restores the token on hard reload.
	$effect(() => {
		if (auth.loading) return;

		const targetId = id;
		// Touched so the effect re-runs when the tab changes, not just the chat.
		void currentKind;

		const controller = new AbortController();
		let cancelled = false;

		items = [];
		linkItems = [];
		cursor = null;
		hasMore = true;
		error = null;
		initialLoading = true;
		resolvedId = null;

		(async () => {
			const found = await source.resolveId(targetId);
			if (cancelled) return;
			if (!found) {
				initialLoading = false;
				error = t.media.chatNotFound;
				return;
			}
			resolvedId = found;
			await loadMore(controller.signal);
			if (!cancelled) initialLoading = false;
		})().catch((e) => {
			if (cancelled) return;
			initialLoading = false;
			error = (e as Error)?.message || t.media.loadFailed;
		});

		return () => {
			cancelled = true;
			controller.abort();
		};
	});

	return {
		get kind() { return currentKind; },
		get items() { return items; },
		get linkItems() { return linkItems; },
		get loading() { return loading; },
		get initialLoading() { return initialLoading; },
		get hasMore() { return hasMore; },
		get error() { return error; },
		loadMore,
		setKind(next: MediaKind) { goto(source.href(id, next)); },
	};
}
