<script lang="ts">
	import { page } from '$app/state';
	import { groupsService } from '$lib/api/groupsService.js';
	import { routes } from '$lib/routes.js';
	import BackButton from '$lib/components/ui/BackButton.svelte';
	import PageColumn from '$lib/components/layouts/PageColumn.svelte';
	import MediaGallery from '$lib/components/media/MediaGallery.svelte';
	import type { MediaKind } from '$lib/utils/mediaGallery.js';
	import { useMediaGallery } from '$lib/hooks/media/useMediaGallery.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	const groupId = $derived(page.params.id!);
	const kind = $derived<MediaKind>((page.url.searchParams.get('kind') as MediaKind) ?? 'photos');

	const gallery = useMediaGallery(() => groupId, () => kind, {
		// A group is keyed by its own id — nothing to look up.
		resolveId: async (id) => id,
		fetchMedia: (id, k, cursor, signal) => groupsService.getMedia(id, k, cursor, signal),
		fetchLinks: (id, cursor, signal) => groupsService.getLinks(id, cursor, signal),
		href: (id, k) => routes.chats.groupMedia(id, k),
	});
</script>

<PageColumn maxWidth="720px" paddingTop="var(--header-h-padding-xl)">
	<header class="media-header">
		<BackButton backHref={routes.chats.groupInfo(groupId)} />
		<h1 class="heading-xl">{t.media.titles[gallery.kind]}</h1>
	</header>

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

<style>
	.media-header {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
	}
</style>
