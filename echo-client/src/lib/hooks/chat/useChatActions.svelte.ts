import { goto } from '$app/navigation';
import { uploadStore } from '$lib/stores/uploads.svelte.js';
import { toasts } from '$lib/stores/toasts.svelte.js';
import { routes } from '$lib/routes.js';
import {
	forwardMessagesToGroup,
	forwardMessagesToPersonalChat,
	type ForwardableMessage,
} from '$lib/utils/forwarding.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';
import type { ChatAttachment, ChatMessage, ChatService } from '$lib/chat/types.js';
import type { VoiceMeta } from '$lib/api/personalChats.js';
import type { ForwardTarget } from '$lib/components/chat/ForwardPicker.svelte';
import type { useMessageSelection } from '$lib/hooks/chat/useMessageSelection.svelte.js';

/**
 * Everything a person can do to messages in a chat: send them, edit, delete,
 * pin, react, forward.
 *
 * None of it touches the list. Each call is fire-and-forget — the socket event
 * is what actually updates what's on screen, so a failure only needs reporting.
 * The one exception is sending, which holds `sending` to keep the composer from
 * firing twice.
 */
export function useChatActions<TMsg extends ChatMessage, TAtt extends ChatAttachment>(options: {
	/** Service-call key: a group id for group chat, a channel id for voice chat. */
	id: () => string;
	/** Blob-scope owner for uploads — not always the same as `id`. */
	uploadId: () => string;
	service: () => ChatService<TMsg, TAtt>;
	/** The rendered list, for resolving a forward's selection back to messages. */
	messages: () => ChatMessage[];
	selection: ReturnType<typeof useMessageSelection>;
}) {
	const t = $derived(i18n.t);
	const service = $derived(options.service());
	const id = $derived(options.id());

	let sending = $state(false);

	async function run(action: () => Promise<unknown>, failure: string) {
		try {
			await action();
		} catch (err) {
			console.error('[useChatActions]', failure, err);
			toasts.error(failure);
		}
	}

	async function deleteMessage(messageId: string) {
		await run(() => service.deleteMessage(messageId), t.chat.deleteFailed);
	}

	async function unpin(messageId: string) {
		await run(() => service.unpin(messageId), t.chat.unpinFailed);
	}

	return {
		get sending() { return sending; },

		async send(text: string, files: File[]) {
			const trimmed = text.trim();
			if ((!trimmed && files.length === 0) || sending) return;
			sending = true;
			try {
				let attachments: TAtt[] | undefined;
				if (files.length > 0) {
					const result = await uploadStore.startUpload(options.uploadId(), files, trimmed);
					if (!result) return;
					attachments = result.attachments as unknown as TAtt[];
				}
				await service.sendMessage(id, trimmed, attachments);
			} catch (err) {
				console.error('[useChatActions] send failed', err);
				toasts.error(t.chat.sendFailed);
			} finally {
				sending = false;
			}
		},

		async sendVoice(file: File, meta: VoiceMeta) {
			if (sending) return;
			sending = true;
			try {
				const result = await uploadStore.startUpload(options.uploadId(), [file], '');
				if (!result || result.attachments.length === 0) return;
				// Tag the uploaded blob as a voice message. The server stores
				// attachments as opaque jsonb, so this round-trips without either
				// surface needing backend awareness.
				const tagged = (result.attachments as unknown as TAtt[]).map((a, i) =>
					i === 0 ? ({ ...a, voice: meta } as TAtt) : a,
				);
				await service.sendMessage(id, '', tagged);
			} catch (err) {
				console.error('[useChatActions] send voice failed', err);
				toasts.error(t.chat.sendVoiceFailed);
			} finally {
				sending = false;
			}
		},

		deleteMessage,
		unpin,

		async deleteSelected() {
			const ids = options.selection.ids();
			if (ids.length === 0) return;
			options.selection.clear();
			await Promise.all(
				ids.map((mId) =>
					service.deleteMessage(mId).catch((err) => {
						console.error('[useChatActions] delete failed for', mId, err);
					}),
				),
			);
		},

		async editMessage(messageId: string, content: string) {
			const trimmed = content.trim();
			// Emptying a message is how you delete it from the edit box.
			if (!trimmed) return deleteMessage(messageId);
			await run(() => service.editMessage(messageId, trimmed), t.chat.editFailed);
		},

		async pin(messageId: string) {
			await run(() => service.pin(messageId), t.chat.pinFailed);
		},

		async react(messageId: string, emoji: string) {
			await run(() => service.toggleReaction(messageId, emoji), t.chat.reactionFailed);
		},

		async forward(target: ForwardTarget) {
			const ids = options.selection.ids();
			options.selection.clear();
			const ordered = ids
				.map((mid) => options.messages().find((m) => m.id === mid))
				.filter((m): m is ChatMessage => !!m) as unknown as ForwardableMessage[];
			try {
				if (target.kind === 'chat') {
					await forwardMessagesToPersonalChat(target.chat.user, ordered);
					goto(routes.chats.perschatUser(target.chat.user.id));
				} else {
					await forwardMessagesToGroup(target.group.id, ordered);
					goto(routes.chats.group(target.group.id));
				}
			} catch (err) {
				console.error('[useChatActions] forward failed', err);
				toasts.error(t.chat.forwardFailed);
			}
		},
	};
}
