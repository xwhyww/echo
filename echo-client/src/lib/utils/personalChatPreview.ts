import type { LastMessage, PersonalMessage } from '$lib/api/personalChats.js';

/**
 * The one-line summary the chat list shows under a name.
 *
 * `voice` has to survive the trip: `lastMessageLabel` reads it to say "Voice
 * message" rather than counting the blob as an audio file. Four of the five
 * places that built this object by hand left it out, so a voice note promoted
 * to last message — by an edit, a delete or a forward — silently changed what
 * the sidebar called it.
 */
export function lastMessagePreview(msg: PersonalMessage): LastMessage {
	return {
		content: msg.content,
		authorId: msg.authorId,
		createdAt: msg.createdAt,
		attachments: msg.attachments.map((a) => ({ mimeType: a.mimeType, voice: !!a.voice })),
	};
}
