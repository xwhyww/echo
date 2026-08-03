import { auth } from '$lib/stores/auth.svelte.js';
import { ApiError } from '$lib/api/client.js';
import { personalChatsService } from '$lib/api/personalChatsService.js';
import { personalChatsStore } from '$lib/stores/personalChats.svelte.js';
import { userService } from '$lib/api/userService.js';
import { uploadStore } from '$lib/stores/uploads.svelte.js';
import { draftsMap, setDraftFor, setEditingDraft } from '$lib/hooks/chat/chatDrafts.svelte.js';
import { lastMessagePreview } from '$lib/utils/personalChatPreview.js';
import type {
	Attachment,
	PersonalChatUser,
	PersonalMessage,
	ReplyToSnapshot,
	VoiceMeta,
} from '$lib/api/personalChats.js';

/** How much of the message being replied to is kept in the quote. */
const REPLY_SNAPSHOT_CHARS = 200;

/**
 * The half of a personal chat that composes rather than reads: the draft, what
 * is being replied to, sending text, files and voice, and the upload tasks
 * behind them.
 *
 * These belong together because they fail together: a 403 from any of them is
 * "this person has blocked you", which is a state of the composer, not of the
 * conversation. The message list stays with `usePersonalChat` — what comes back
 * from a send is handed over through `onSent`.
 */
export function useDmComposer(options: {
	companionId: () => string;
	/** Known profile, when the chat is already in the list — saves a lookup. */
	companion: () => PersonalChatUser | null;
	/** Reading history: get back to the live end before adding to it. */
	beforeSend: () => Promise<void>;
	onSent: (chatId: string, message: PersonalMessage) => void;
	afterSent: () => void;
	ontyping: () => void;
}) {
	let draft = $state('');
	let replyingTo = $state<{ messageId: string; snapshot: ReplyToSnapshot } | null>(null);
	let blockedReason = $state<string | null>(null);

	const uploadTasks = $derived(uploadStore.getAllByCompanion(options.companionId()));

	/** The chat list needs a name and an avatar for someone never written to. */
	async function lookupUser(userId: string): Promise<PersonalChatUser | null> {
		try {
			const r = await userService.getById(userId);
			return {
				id: r.user.id,
				username: r.user.username,
				displayName: r.user.displayName,
				avatarUrl: r.user.avatarUrl ?? null,
				isOnline: r.user.isOnline ?? false,
			};
		} catch {
			return null;
		}
	}

	async function sendOne(content: string, attachments: Attachment[], replyToId?: string) {
		const companionId = options.companionId();
		const result = await personalChatsService.sendMessage(
			companionId,
			content,
			attachments,
			replyToId,
		);
		options.onSent(result.chatId, result.message);

		// A note to yourself has no row in the chat list to keep up to date.
		if (companionId === auth.user?.id) return;

		// The row the sidebar put up while the chat didn't exist yet becomes the
		// real one; there's nothing to look up.
		if (personalChatsStore.tempChat && !personalChatsStore.findByUserId(companionId)) {
			personalChatsStore.promoteTempToReal(result.chatId);
			return;
		}

		const user = options.companion() ?? (await lookupUser(companionId));
		if (user) {
			personalChatsStore.noteOutgoing(result.chatId, user, lastMessagePreview(result.message));
		}
	}

	/** A send that fails with 403 means blocked — anything else is ours to log. */
	function reportFailure(e: unknown, what: string) {
		if (e instanceof ApiError && e.status === 403) blockedReason = e.message;
		else console.error(what, e);
	}

	/** Common preamble: land at the bottom, and take the reply target with us. */
	async function beginSend(): Promise<string | undefined> {
		await options.beforeSend();
		const replyToId = replyingTo?.messageId;
		replyingTo = null;
		return replyToId;
	}

	function clearDraft() {
		draft = '';
		draftsMap.delete(options.companionId());
	}

	return {
		get draft() { return draft; },
		// Set when a cached conversation is restored, and by the field itself.
		set draft(v: string) { draft = v; },
		get replyingTo() { return replyingTo; },
		get blockedReason() { return blockedReason; },
		set blockedReason(v: string | null) { blockedReason = v; },
		get uploadTasks() { return uploadTasks; },

		onDraftChange(text: string) {
			draft = text;
			const saved = draftsMap.get(options.companionId()) ?? '';
			// Marks the sidebar row as holding an unsent edit.
			setEditingDraft(text !== saved ? options.companionId() : null);
			if (text.trim()) options.ontyping();
		},

		setReply(msg: PersonalMessage) {
			replyingTo = {
				messageId: msg.id,
				snapshot: {
					authorId: msg.authorId,
					authorName: msg.author.displayName || msg.author.username,
					content: msg.content.slice(0, REPLY_SNAPSHOT_CHARS),
					attachmentType: msg.attachments.length > 0 ? msg.attachments[0].mimeType : null,
				},
			};
		},

		cancelReply() {
			replyingTo = null;
		},

		async send(text: string, attachedFiles?: File[]) {
			const companionId = options.companionId();
			if (!auth.token || !companionId) return;
			const replyToId = await beginSend();

			try {
				if (!attachedFiles || attachedFiles.length === 0) {
					if (text) await sendOne(text, [], replyToId);
					draft = '';
					setDraftFor(companionId, '');
					options.afterSent();
					return;
				}

				// All attached files, whatever their type, plus any accompanying
				// text go out as a single message.
				const result = await uploadStore.startUpload(companionId, attachedFiles, text);
				if (result) await sendOne(result.text, result.attachments, replyToId);
				clearDraft();
				options.afterSent();
			} catch (e) {
				reportFailure(e, 'Failed to send:');
			}
		},

		async sendVoice(file: File, meta: VoiceMeta) {
			const companionId = options.companionId();
			if (!auth.token || !companionId) return;
			const replyToId = await beginSend();

			try {
				const result = await uploadStore.startUpload(companionId, [file], '');
				if (!result || result.attachments.length === 0) return;
				// Tag the freshly-uploaded blob as a voice message. The server stores
				// attachments as opaque jsonb, so this field round-trips without any
				// backend changes.
				const attachments = result.attachments.map((a, i) =>
					i === 0 ? { ...a, voice: meta } : a,
				);
				await sendOne('', attachments, replyToId);
				options.afterSent();
			} catch (e) {
				reportFailure(e, 'Failed to send voice message:');
			}
		},

		cancelUpload(taskId: string) {
			uploadStore.cancelUpload(taskId);
		},

		removeFailedUpload(taskId: string) {
			uploadStore.removeTask(taskId);
		},

		async retryUpload(taskId: string) {
			const result = await uploadStore.retryUpload(taskId);
			if (!result) return;
			try {
				await sendOne(result.text, result.attachments);
				options.afterSent();
			} catch (e) {
				reportFailure(e, 'Failed to send:');
			}
		},
	};
}
