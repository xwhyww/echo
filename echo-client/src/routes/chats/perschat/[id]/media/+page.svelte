<script lang="ts">
	import { page } from '$app/state';
	import { personalChatsService } from '$lib/api/personalChatsService.js';
	import { routes } from '$lib/routes.js';
	import PageColumn from '$lib/components/layouts/PageColumn.svelte';
	import MediaGallery from '$lib/components/media/MediaGallery.svelte';
	import type { MediaKind } from '$lib/utils/mediaGallery.js';
	import { useMediaGallery } from '$lib/hooks/media/useMediaGallery.svelte.js';

	const userId = $derived(page.params.id!);
	const kind = $derived<MediaKind>((page.url.searchParams.get('kind') as MediaKind) ?? 'photos');

	const gallery = useMediaGallery(() => userId, () => kind, {
		// The route carries the companion; the media endpoints want the chat.
		resolveId: async (id) => (await personalChatsService.getByCompanionId(id)).chat?.id ?? null,
		fetchMedia: (id, k, cursor, signal) => personalChatsService.getMedia(id, k, cursor, signal),
		fetchLinks: (id, cursor, signal) => personalChatsService.getLinks(id, cursor, signal),
		href: (id, k) => routes.chats.perschatMedia(id, k),
	});
</script>

<PageColumn maxWidth="720px" paddingTop="var(--header-h-padding-xl)" gap="var(--sp-4)">
	<MediaGallery
		kind={gallery.kind}
		items={gallery.items}
		linkItems={gallery.linkItems}
		initialLoading={gallery.initialLoading}
		loading={gallery.loading}
		hasMore={gallery.hasMore}
		error={gallery.error}
		onsetkind={gallery.setKind}
		onloadmore={gallery.loadMore}
	/>
</PageColumn>
