/**
 * The shapes the media galleries pass around, and the one piece of logic that
 * goes with them. Kept out of the components so the gallery, its four layouts
 * and the hook that loads them can all refer to the same types without
 * importing each other in a circle.
 */

export type MediaKind = 'photos' | 'videos' | 'gifs' | 'audio' | 'files' | 'links';

export const MEDIA_KINDS: MediaKind[] = ['photos', 'videos', 'gifs', 'audio', 'files', 'links'];

/**
 * Structural attachment shape shared by DM `Attachment` and `GroupAttachment` —
 * the gallery only reads these fields, so either concrete type satisfies it.
 */
export type GalleryAttachment = {
	id: string;
	url: string;
	thumbUrl?: string | null;
	mimeType: string;
	filename: string;
	size: number;
};

export type MediaGalleryItem = {
	messageId: string;
	createdAt: string;
	attachment: GalleryAttachment;
};

/**
 * `id` is the links table's own row id — the only unique thing about a link.
 * One message can post the same URL twice, so neither the URL nor the pair
 * with the message id identifies a row (a keyed `{#each}` on that pair throws
 * `each_key_duplicate`). It doubles as the pagination cursor.
 */
export type MediaGalleryLink = { id: number; messageId: string; createdAt: string; url: string };

/**
 * Forwarding copies an attachment verbatim, id included, so the same attachment
 * id can appear under several messages in one gallery. Only the pair is unique.
 */
export function galleryItemKey(item: MediaGalleryItem): string {
	return `${item.messageId}:${item.attachment.id}`;
}

/**
 * Dresses a bare image URL up as the one-item attachment list `MediaViewer`
 * expects. Avatars — a user's, a group's — are not attachments: they are a
 * column on a row. This is the adapter that lets them use the same fullscreen
 * viewer as everything else, rather than growing a second one that would have
 * to be kept in step with it.
 *
 * `size` is 0 and the mime type is generic because neither is known here, and
 * the viewer reads neither for an image — only `mimeType.startsWith('video/')`,
 * to decide which tag to render.
 */
export function imageAsAttachment(id: string, url: string, filename: string): GalleryAttachment {
	return { id, url, thumbUrl: null, filename, mimeType: 'image/*', size: 0 };
}
