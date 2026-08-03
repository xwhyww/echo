// Everything a message bubble does apart from render. Three of the four jobs
// have moved out to where they can be shared or tested — bucketing attachments
// (`splitAttachments`), listing who reacted (`reactorRows`), the menu and its
// target (`useBubbleMenu`), the heart gesture (`useDoubleTap`) — and what is
// left here is the wiring between them and the shape the markup reads.

import type { Attachment, MessageReaction } from '$lib/api/personalChats.js';
import { useBubbleMenu, type ClickTarget } from '$lib/hooks/chat/useBubbleMenu.svelte.js';
import { useDoubleTap } from '$lib/hooks/ui/useDoubleTap.svelte.js';
import { splitAttachments } from '$lib/utils/attachmentKind.js';
import { isEmojiOnly as isEmojiOnlyText } from '$lib/utils/messageSegments.js';
import { reactorRows as buildReactorRows } from '$lib/utils/reactions.js';

export type { ClickTarget };

type ReactorInfo = { name: string; avatarUrl: string | null } | null;

export interface ChatBubbleInput {
	content: () => string;
	attachments: () => Attachment[];
	reactions: () => MessageReaction[];
	currentUserId: () => string | null;
	reactorLookup: () => ((userId: string) => ReactorInfo) | undefined;
	time: () => string;
	own: () => boolean;
	selecting: () => boolean;
	replyToId: () => string | null | undefined;
	onreact: () => ((emoji: string) => void) | undefined;
	onreplyjump: () => ((messageId: string) => void) | undefined;
	onmedia: () => ((attachments: Attachment[], index: number) => void) | undefined;
}

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function useChatBubble(input: ChatBubbleInput) {
	const byKind = $derived(splitAttachments(input.attachments()));

	const voiceAttachments = $derived(byKind.voice);
	const mediaAttachments = $derived(byKind.media);
	const audioAttachments = $derived(byKind.audio);
	const fileAttachments = $derived(byKind.file);

	/** Pictures and nothing else: the bubble drops its padding around them. */
	const mediaOnly = $derived(
		mediaAttachments.length > 0 &&
			fileAttachments.length === 0 &&
			voiceAttachments.length === 0 &&
			audioAttachments.length === 0 &&
			!input.content().trim(),
	);
	const imageCount = $derived(mediaAttachments.length);
	const isEmojiOnly = $derived(isEmojiOnlyText(input.content()));

	const canEdit = $derived(
		input.own() && Date.now() - new Date(input.time()).getTime() < EDIT_WINDOW_MS,
	);

	const myReactionEmoji = $derived.by(() => {
		const me = input.currentUserId();
		if (!me) return null;
		return input.reactions().find((r) => r.userIds.includes(me))?.emoji ?? null;
	});

	const reactionsTotalCount = $derived(
		input.reactions().reduce((sum, r) => sum + r.count, 0),
	);

	const reactorRows = $derived(buildReactorRows(input.reactions(), input.reactorLookup()));

	// Double tap hearts the message. Not on a link, a button or the media
	// trigger, where the second tap means what that control means.
	const heart = useDoubleTap({
		enabled: (target) => {
			if (input.selecting() || !input.onreact()) return false;
			return !(target as HTMLElement | null)?.closest('a, button, .media-trigger');
		},
		ontrigger: () => input.onreact()?.('❤️'),
	});

	const menu = useBubbleMenu({
		content: input.content,
		attachments: input.attachments,
		selecting: input.selecting,
		// Otherwise the release that ends the press counts as the first half of a
		// double tap and the next tap fires a heart.
		onbeforelongpress: heart.forget,
	});

	return {
		get voiceAttachments() { return voiceAttachments; },
		get mediaAttachments() { return mediaAttachments; },
		get audioAttachments() { return audioAttachments; },
		get fileAttachments() { return fileAttachments; },
		get mediaOnly() { return mediaOnly; },
		get imageCount() { return imageCount; },
		get isEmojiOnly() { return isEmojiOnly; },

		get showContextMenu() { return menu.open; },
		/**
		 * Everything the menu needs to describe itself for this message. One
		 * object because it was never seven decisions — it is one answer to
		 * "what can be done here", and the seven were only taken apart on the
		 * way down into the markup.
		 */
		get menuProps() {
			return {
				selectOnly: menu.selectOnly,
				canEdit,
				canCopy: menu.canCopy,
				downloadLabel: menu.downloadLabel,
				myReactionEmoji,
				reactorRows,
				reactionsTotalCount,
			};
		},
		openContextMenu: menu.openOn,
		closeMenu: menu.close,
		handleRowContextMenu: menu.openOnRow,
		handleLongPress: menu.openOnLongPress,
		download: menu.download,

		handleBubbleDblClick: heart.ondblclick,
		handleBubblePointerUp: heart.onpointerup,

		handleReactionClick(emoji: string) {
			input.onreact()?.(emoji);
		},
		handleReplyJump() {
			const replyToId = input.replyToId();
			if (replyToId) input.onreplyjump()?.(replyToId);
		},
		openMedia(idx: number) {
			input.onmedia()?.(mediaAttachments, idx);
		},
	};
}
