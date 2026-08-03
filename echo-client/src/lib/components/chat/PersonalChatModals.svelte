<script lang="ts">
	import DeleteMessageModal from '$lib/components/chat/DeleteMessageModal.svelte';
	import FilePreviewModal from '$lib/components/media/FilePreviewModal.svelte';
	import ForwardPicker from '$lib/components/chat/ForwardPicker.svelte';
	import MediaViewer from '$lib/components/media/MediaViewer.svelte';
	import ReactionPickerModal from '$lib/components/emoji/ReactionPickerModal.svelte';
	import UndoBar from '$lib/components/ui/UndoBar.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { usePersonalChatActions } from '$lib/hooks/chat/usePersonalChatActions.svelte.js';
	import type { useMentionNavigation } from '$lib/hooks/chat/useMentionNavigation.svelte.js';

	const t = $derived(i18n.t);

	// Every overlay a personal chat can raise, gathered so the page itself is
	// just the conversation. At most one is ever open.
	interface Props {
		actions: ReturnType<typeof usePersonalChatActions>;
		mentions: ReturnType<typeof useMentionNavigation>;
	}

	let { actions, mentions }: Props = $props();
</script>

{#if actions.editModal}
	<FilePreviewModal
		mode="edit"
		existingAttachments={actions.editModal.attachments}
		text={actions.editModal.content}
		onconfirm={actions.applyEdit}
		onclose={actions.closeEditModal}
	/>
{/if}

{#if actions.mediaViewer}
	<MediaViewer
		attachments={actions.mediaViewer.attachments}
		startIndex={actions.mediaViewer.index}
		onclose={actions.closeMediaViewer}
	/>
{/if}

{#if actions.forwardPickerOpen}
	<ForwardPicker onselect={actions.applyForward} onclose={actions.closeForwardPicker} />
{/if}

{#if actions.deleteModal}
	<DeleteMessageModal
		count={actions.deleteModal.messageIds.length}
		ondelete={actions.applyDelete}
		onclose={actions.closeDeleteModal}
	/>
{/if}

{#if actions.reactionPickerFor}
	<ReactionPickerModal onselect={actions.pickReaction} onclose={actions.closeReactionPicker} />
{/if}

<!-- Both of these report "that isn't there any more" rather than offering an
     undo; the bar is reused for its shape and its timeout. -->
{#if actions.jumpFailed}
	<UndoBar
		message={t.chat.deletedMessage}
		duration={3000}
		onconfirm={actions.dismissJumpFailed}
		oncancel={actions.dismissJumpFailed}
	/>
{/if}

{#if mentions.error}
	<UndoBar
		message={mentions.error}
		duration={3000}
		onconfirm={mentions.dismiss}
		oncancel={mentions.dismiss}
	/>
{/if}
