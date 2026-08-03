const EMOJI = String.raw`(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*`;

const emojiRegex = new RegExp(EMOJI, 'gu');
const emojiOnlyRegex = new RegExp(String.raw`^(?:${EMOJI}\s*)+$`, 'u');
const urlRegex = /https?:\/\/[^\s)>\]]+/g;
const mentionRegex = /@([a-zA-Z0-9_]+)/g;

export type Segment = { text: string; kind: 'text' | 'emoji' | 'link' | 'mention' };

export function isEmojiOnly(content: string): boolean {
	return emojiOnlyRegex.test(content.trim());
}

/** Splits message text into typed runs: URLs first, then @mentions, then emoji. */
export function splitSegments(content: string): Segment[] {
	// First pass: split by URLs
	const urlSegments: { text: string; isUrl: boolean }[] = [];
	let lastIndex = 0;
	for (const match of content.matchAll(urlRegex)) {
		if (match.index > lastIndex) {
			urlSegments.push({ text: content.slice(lastIndex, match.index), isUrl: false });
		}
		urlSegments.push({ text: match[0], isUrl: true });
		lastIndex = match.index + match[0].length;
	}
	if (lastIndex < content.length) {
		urlSegments.push({ text: content.slice(lastIndex), isUrl: false });
	}

	// Second pass: split non-URL segments by mentions, then emoji
	const result: Segment[] = [];
	for (const seg of urlSegments) {
		if (seg.isUrl) {
			result.push({ text: seg.text, kind: 'link' });
			continue;
		}
		// Split by @mentions first
		const mentionParts: { text: string; isMention: boolean }[] = [];
		let mentionLast = 0;
		for (const match of seg.text.matchAll(mentionRegex)) {
			if (match.index > mentionLast) {
				mentionParts.push({ text: seg.text.slice(mentionLast, match.index), isMention: false });
			}
			mentionParts.push({ text: match[0], isMention: true });
			mentionLast = match.index + match[0].length;
		}
		if (mentionLast < seg.text.length) {
			mentionParts.push({ text: seg.text.slice(mentionLast), isMention: false });
		}

		// Then split non-mention parts by emoji
		for (const part of mentionParts) {
			if (part.isMention) {
				result.push({ text: part.text, kind: 'mention' });
				continue;
			}
			let emojiLast = 0;
			for (const match of part.text.matchAll(emojiRegex)) {
				if (match.index > emojiLast) {
					result.push({ text: part.text.slice(emojiLast, match.index), kind: 'text' });
				}
				result.push({ text: match[0], kind: 'emoji' });
				emojiLast = match.index + match[0].length;
			}
			if (emojiLast < part.text.length) {
				result.push({ text: part.text.slice(emojiLast), kind: 'text' });
			}
		}
	}
	return result;
}
