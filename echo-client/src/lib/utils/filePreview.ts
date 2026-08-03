import type { Attachment } from '$lib/api/personalChats.js';

/**
 * What the attach/edit preview holds: a file the user just picked, or an
 * attachment already on the message being edited. Both are removable, both
 * render as a card, so the grouping below treats them alike.
 */
export type PreviewItem =
	| { kind: 'file'; file: File }
	| { kind: 'attachment'; attachment: Attachment };

export type PreviewGroupKind = 'images' | 'gifs' | 'videos' | 'audio' | 'files';

export type PreviewGroup = {
	kind: PreviewGroupKind;
	/** One row is one message: the chat splits a mixed selection this way. */
	rows: PreviewItem[][];
	/** Documents stack full-width; media tiles. */
	column: boolean;
};

/** Beyond this a single message would be an unreadable wall of thumbnails. */
const ROW_SIZE = 5;

export function itemMime(item: PreviewItem): string {
	return item.kind === 'file' ? item.file.type : item.attachment.mimeType;
}

export function itemName(item: PreviewItem): string {
	return item.kind === 'file' ? item.file.name : item.attachment.filename;
}

export function itemSize(item: PreviewItem): number {
	return item.kind === 'file' ? item.file.size : item.attachment.size;
}

export function filesOf(items: PreviewItem[]): File[] {
	return items.flatMap((i) => (i.kind === 'file' ? [i.file] : []));
}

export function attachmentsOf(items: PreviewItem[]): Attachment[] {
	return items.flatMap((i) => (i.kind === 'attachment' ? [i.attachment] : []));
}

function chunk(arr: PreviewItem[]): PreviewItem[][] {
	const rows: PreviewItem[][] = [];
	for (let i = 0; i < arr.length; i += ROW_SIZE) rows.push(arr.slice(i, i + ROW_SIZE));
	return rows;
}

function kindOf(item: PreviewItem): PreviewGroupKind {
	const mime = itemMime(item);
	if (mime === 'image/gif') return 'gifs';
	if (mime.startsWith('image/')) return 'images';
	if (mime.startsWith('video/')) return 'videos';
	if (mime.startsWith('audio/')) return 'audio';
	return 'files';
}

/** Fixed order, so adding a file never reshuffles the groups above it. */
const ORDER: PreviewGroupKind[] = ['images', 'gifs', 'videos', 'audio', 'files'];

export function groupPreviewItems(items: PreviewItem[]): PreviewGroup[] {
	return ORDER.flatMap((kind) => {
		const own = items.filter((i) => kindOf(i) === kind);
		return own.length ? [{ kind, rows: chunk(own), column: kind === 'files' }] : [];
	});
}

/** How many messages the current selection would become when sent. */
export function messageCount(groups: PreviewGroup[]): number {
	return groups.reduce((sum, g) => sum + g.rows.length, 0);
}
