import data from '@emoji-mart/data';

const nativeToUnified: Record<string, string> = {};
for (const id in (data as any).emojis) {
	for (const skin of (data as any).emojis[id].skins) {
		if (skin?.native && skin?.unified) {
			nativeToUnified[skin.native] = skin.unified;
		}
	}
}

export function getAppleEmojiUrl(native: string): string | null {
	const unified = nativeToUnified[native];
	return unified ? `/emojis/apple/64/${unified}.png` : null;
}

export type EmojiSegment =
	| { type: 'text'; value: string }
	| { type: 'emoji'; native: string; url: string };

const segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
	? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
	: null;

export function segmentAppleEmojis(text: string): EmojiSegment[] {
	if (!text) return [];
	if (!segmenter) return [{ type: 'text', value: text }];
	const segments: EmojiSegment[] = [];
	let buffer = '';
	for (const { segment } of segmenter.segment(text)) {
		const url = getAppleEmojiUrl(segment);
		if (url) {
			if (buffer) {
				segments.push({ type: 'text', value: buffer });
				buffer = '';
			}
			segments.push({ type: 'emoji', native: segment, url });
		} else {
			buffer += segment;
		}
	}
	if (buffer) segments.push({ type: 'text', value: buffer });
	return segments;
}
