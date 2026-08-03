<script lang="ts">
	import { untrack } from 'svelte';
	import { Paperclip, Smile } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ButtonIcon from '$lib/components/ui/ButtonIcon.svelte';
	import EmojiPicker from '$lib/components/emoji/EmojiPicker.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import FilePreviewGroups from '$lib/components/media/FilePreviewGroups.svelte';
	import type { Attachment } from '$lib/api/personalChats.js';
	import {
		attachmentsOf,
		filesOf,
		groupPreviewItems,
		messageCount,
		type PreviewItem,
	} from '$lib/utils/filePreview.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		files?: File[];
		existingAttachments?: Attachment[];
		text?: string;
		mode?: 'send' | 'edit';
		onconfirm: (files: File[], text: string, keptAttachments?: Attachment[]) => void;
		onclose: () => void;
	}

	let {
		files: initialFiles = [],
		existingAttachments = [],
		text = $bindable(''),
		mode = 'send',
		onconfirm,
		onclose,
	}: Props = $props();

	// Deliberately a snapshot: the dialog owns the selection from the moment it
	// opens, and later prop changes must not undo what the user removed here.
	let items = $state<PreviewItem[]>(
		untrack(() => [
			...existingAttachments.map((a): PreviewItem => ({ kind: 'attachment', attachment: a })),
			...initialFiles.map((f): PreviewItem => ({ kind: 'file', file: f })),
		]),
	);

	let fileInput = $state<HTMLInputElement>();
	let showEmoji = $state(false);
	let modalInput = $state<HTMLTextAreaElement | null>(null);

	const groups = $derived(groupPreviewItems(items));
	const splitInto = $derived(mode === 'send' ? messageCount(groups) : 0);

	function removeItem(item: PreviewItem) {
		items = items.filter((i) => i !== item);
		if (mode === 'send' && items.length === 0 && !text.trim()) onclose();
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files) return;
		items = [...items, ...Array.from(input.files).map((f): PreviewItem => ({ kind: 'file', file: f }))];
		input.value = '';
	}

	function handleConfirm() {
		if (mode === 'send' && items.length === 0 && !text.trim()) return;
		onconfirm(filesOf(items), text, mode === 'edit' ? attachmentsOf(items) : undefined);
	}

	function handleInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleConfirm();
		}
	}

	function insertEmoji(emoji: string) {
		if (!modalInput) {
			text += emoji;
			return;
		}
		const start = modalInput.selectionStart;
		const end = modalInput.selectionEnd;
		text = text.slice(0, start) + emoji + text.slice(end);
		requestAnimationFrame(() => {
			if (!modalInput) return;
			const pos = start + emoji.length;
			modalInput.selectionStart = pos;
			modalInput.selectionEnd = pos;
			modalInput.focus();
		});
	}
</script>

<Modal
	title={mode === 'edit' ? t.chat.editMessageTitle : t.chat.filesSelected(items.length)}
	{onclose}
>
	{#if groups.length}
		<div class="preview-body">
			<FilePreviewGroups {groups} {splitInto} onremove={removeItem} />
		</div>
	{/if}

	{#if showEmoji}
		<div class="emoji-section">
			<EmojiPicker onselect={insertEmoji} pickerStyle="none" />
		</div>
	{/if}

	<Textarea
		bind:el={modalInput}
		bind:value={text}
		placeholder={t.chat.addMessage}
		onkeydown={handleInputKeydown}
	/>
	<input
		bind:this={fileInput}
		type="file"
		multiple
		class="hidden-file-input"
		onchange={handleFileSelect}
	/>

	{#snippet actions()}
		<div class="preview-actions">
			<div class="preview-tools">
				<ButtonIcon size="sm" title={t.chat.addFiles} onclick={() => fileInput?.click()}>
					<Paperclip size={16} />
				</ButtonIcon>
				<ButtonIcon size="sm" title={t.common.emoji} onclick={() => (showEmoji = !showEmoji)}>
					<Smile size={16} class={showEmoji ? 'emoji-active' : ''} />
				</ButtonIcon>
			</div>

			<div class="preview-submit">
				<Button variant="ghost" onclick={onclose}>{t.common.cancel}</Button>
				<Button variant="primary" onclick={handleConfirm}>
					{mode === 'edit' ? t.common.saveShort : t.chat.sendFiles(items.length)}
				</Button>
			</div>
		</div>
	{/snippet}
</Modal>

<style>
	/* The one scrolling region: the composer below it must stay reachable
	   however many files are queued. */
	.preview-body {
		overflow-y: auto;
		max-height: 45vh;
	}

	.emoji-section {
		height: 280px;
	}

	.emoji-section :global(em-emoji-picker) {
		width: 100%;
		height: 100%;
	}

	.hidden-file-input {
		display: none;
	}

	.preview-actions {
		flex: 1;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-3);
	}

	.preview-tools,
	.preview-submit {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
</style>
