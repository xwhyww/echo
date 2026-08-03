/**
 * Which part of a bubble renders an attachment. One definition, because two
 * components need it: the settled message and the one still uploading, and the
 * two must bucket a file the same way or it would jump between them.
 */
export type AttachmentKind = 'voice' | 'media' | 'audio' | 'file';

/** The shape the bucketing needs — anything with a mime type will do. */
export interface KindInput {
	mimeType: string;
	/** Set only on recorded voice notes; a plain audio upload has none. */
	voice?: unknown;
}

export function attachmentKind(a: KindInput): AttachmentKind {
	// Recorded voice notes carry a waveform payload and get the player with the
	// waveform; a plain audio upload is still played inline, but bare.
	if (a.voice) return 'voice';
	if (a.mimeType.startsWith('image/') || a.mimeType.startsWith('video/')) return 'media';
	if (a.mimeType.startsWith('audio/')) return 'audio';
	return 'file';
}

/** Shown in the collage at the top of the bubble rather than as a strip. */
export function isMedia(a: KindInput): boolean {
	return attachmentKind(a) === 'media';
}

/**
 * The same attachments, split into the four parts of a bubble that render
 * them. Every bucket exists even when empty, so callers index rather than
 * branch, and one pass replaces the four filters this used to be.
 */
export function splitAttachments<T extends KindInput>(attachments: T[]): Record<AttachmentKind, T[]> {
	const buckets: Record<AttachmentKind, T[]> = { voice: [], media: [], audio: [], file: [] };
	for (const a of attachments) buckets[attachmentKind(a)].push(a);
	return buckets;
}
