import type { Attachment } from '$lib/api/personalChats.js';

/**
 * Which of the panel's three overlays is open: the forward picker, the media
 * viewer, the reaction picker.
 *
 * Each is opened from a different place — a menu item, a tap on a picture, a
 * toolbar button — and none of them is state the panel's layout cares about,
 * which is why they sit here together rather than as three loose flags in the
 * component. Same shape as `useVoiceChannelDialogs`.
 */
export function useChatPanelDialogs() {
	/** The message a picked emoji will be applied to. */
	let reactionPickerFor = $state<string | null>(null);
	let forwarding = $state(false);
	let media = $state<{ attachments: Attachment[]; index: number } | null>(null);

	return {
		get reactionPickerFor() { return reactionPickerFor; },
		get forwarding() { return forwarding; },
		get media() { return media; },

		openReactionPicker(messageId: string) { reactionPickerFor = messageId; },
		closeReactionPicker() { reactionPickerFor = null; },

		openForward() { forwarding = true; },
		closeForward() { forwarding = false; },

		openMedia(attachments: Attachment[], index: number) { media = { attachments, index }; },
		closeMedia() { media = null; },
	};
}
