import { goto } from '$app/navigation';
import { routes } from '$lib/routes.js';
import { toasts } from '$lib/stores/toasts.svelte.js';
import { forwardMessagesToGroup } from '$lib/utils/forwarding.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';
import type { ForwardTarget } from '$lib/components/chat/ForwardPicker.svelte';
import type { usePersonalChat } from '$lib/hooks/chat/usePersonalChat.svelte.js';
import type { useMessageSelection } from '$lib/hooks/chat/useMessageSelection.svelte.js';
import type { Attachment, PersonalMessage } from '$lib/api/personalChats.js';

/**
 * What you can do *to* a message in a personal chat: edit, delete, forward,
 * react, pin, jump. Each one is a transient overlay, so this owns which one is
 * open and what it acts on — the conversation itself stays in `usePersonalChat`.
 */
export function usePersonalChatActions(
	chat: ReturnType<typeof usePersonalChat>,
	selection: ReturnType<typeof useMessageSelection>,
) {
	const t = $derived(i18n.t);

	let editModal = $state<{ messageId: string; content: string; attachments: Attachment[] } | null>(null);
	let mediaViewer = $state<{ attachments: Attachment[]; index: number } | null>(null);
	let deleteModal = $state<{ messageIds: string[] } | null>(null);
	let reactionPickerFor = $state<string | null>(null);
	let forwardPickerOpen = $state(false);
	// The message a reply or search result pointed at is gone — shown as a
	// transient bar rather than a blocking dialog.
	let jumpFailed = $state(false);

	async function jumpTo(messageId: string): Promise<boolean> {
		const ok = await chat.jumpToMessage(messageId);
		if (!ok) jumpFailed = true;
		return ok;
	}

	return {
		get editModal() { return editModal; },
		get mediaViewer() { return mediaViewer; },
		get deleteModal() { return deleteModal; },
		get reactionPickerFor() { return reactionPickerFor; },
		get forwardPickerOpen() { return forwardPickerOpen; },
		get jumpFailed() { return jumpFailed; },

		closeEditModal() { editModal = null; },
		closeMediaViewer() { mediaViewer = null; },
		closeDeleteModal() { deleteModal = null; },
		closeReactionPicker() { reactionPickerFor = null; },
		closeForwardPicker() { forwardPickerOpen = false; },
		dismissJumpFailed() { jumpFailed = false; },

		openEdit(messageId: string, content: string, attachments: Attachment[]) {
			editModal = { messageId, content, attachments };
		},
		openMedia(attachments: Attachment[], index: number) {
			mediaViewer = { attachments, index };
		},
		openReactionPicker(messageId: string) { reactionPickerFor = messageId; },
		confirmDelete(messageIds: string[]) {
			if (messageIds.length > 0) deleteModal = { messageIds };
		},
		/** Forwarding one message from its own menu, rather than a selection. */
		forwardOne(messageId: string) {
			selection.selectOnly(messageId);
			forwardPickerOpen = true;
		},
		forwardSelection() { forwardPickerOpen = true; },

		jumpTo,
		async jumpToSearchResult(messageId: string, onfound: () => void) {
			if (await jumpTo(messageId)) onfound();
		},

		async pin(messageId: string) {
			const error = await chat.pinMessage(messageId);
			if (error) toasts.error(error);
		},

		async react(messageId: string, emoji: string) {
			const error = await chat.setReaction(messageId, emoji);
			if (error) toasts.error(error);
		},

		async pickReaction(emoji: string) {
			const target = reactionPickerFor;
			reactionPickerFor = null;
			if (!target) return;
			const error = await chat.setReaction(target, emoji);
			if (error) toasts.error(error);
		},

		async applyDelete(mode: 'for_me' | 'for_everyone') {
			if (!deleteModal) return;
			const { messageIds } = deleteModal;
			deleteModal = null;
			if (messageIds.length === 1) await chat.deleteMessage(messageIds[0], mode);
			else await chat.deleteMessages(messageIds, mode);
			if (selection.selecting) selection.clear();
		},

		/** An edit that empties the message is a delete — there'd be nothing left. */
		applyEdit(newFiles: File[], text: string, kept?: Attachment[]) {
			const target = editModal;
			editModal = null;
			if (!target) return;
			const isEmpty = !text.trim() && (!kept || kept.length === 0) && newFiles.length === 0;
			if (isEmpty) void chat.deleteMessage(target.messageId);
			else void chat.editMessage(target.messageId, text, kept, newFiles.length > 0 ? newFiles : undefined);
		},

		async applyForward(target: ForwardTarget) {
			forwardPickerOpen = false;
			const ids = selection.ids();
			selection.clear();

			if (target.kind === 'chat') {
				const targetChatId = await chat.forwardMessages(ids, target.chat);
				if (targetChatId) goto(routes.chats.perschatUser(target.chat.user.id));
				return;
			}

			const messages = ids
				.map((id) => chat.messages.find((m) => m.id === id))
				.filter((m): m is PersonalMessage => !!m);
			try {
				await forwardMessagesToGroup(target.group.id, messages);
				goto(routes.chats.group(target.group.id));
			} catch (err) {
				console.error('[usePersonalChatActions] forward to group failed', err);
				toasts.error(t.chat.forwardFailed);
			}
		},
	};
}
