import type { Attachment } from '$lib/api/personalChats.js';
import { isMedia } from '$lib/utils/attachmentKind.js';

/**
 * Dresses the local `File`s of an in-flight upload as the `Attachment` records
 * the settled bubble renders, so a message looks the same while it is on its
 * way as it will once it lands.
 *
 * The blob URLs are why this is a hook and not a util: one is minted per file
 * and revoked when the list changes or the message goes away. Calling
 * `URL.createObjectURL` from the markup instead mints a fresh one on every
 * re-render and revokes none of them.
 */
export function usePendingAttachments(files: () => File[]) {
	let attachments = $state<Attachment[]>([]);

	$effect(() => {
		const urls = files().map((f) => URL.createObjectURL(f));
		attachments = files().map((f, i) => ({
			// Index, not a random id: it has to survive re-renders, or the media
			// grid would tear every tile down and build it again on each progress
			// tick.
			id: `pending-${i}`,
			url: urls[i],
			filename: f.name,
			mimeType: f.type,
			size: f.size,
		}));
		return () => {
			for (const url of urls) URL.revokeObjectURL(url);
		};
	});

	return {
		/** Photos and videos, for the collage at the top of the bubble. */
		get media() {
			return attachments.filter(isMedia);
		},
		/** Everything else, for the file strips under it. */
		get files() {
			return attachments.filter((a) => !isMedia(a));
		},
	};
}
