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

export type MediaGalleryLink = { messageId: string; createdAt: string; url: string };

/**
 * Forwarding copies an attachment verbatim, id included, so the same attachment
 * id can appear under several messages in one gallery. Only the pair is unique.
 */
export function galleryItemKey(item: MediaGalleryItem): string {
	return `${item.messageId}:${item.attachment.id}`;
}
