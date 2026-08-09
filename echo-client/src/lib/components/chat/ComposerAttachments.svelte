<script lang="ts">
	import { Paperclip } from 'lucide-svelte';
	import ButtonIcon from '$lib/components/ui/ButtonIcon.svelte';
	import FilePreviewModal from '$lib/components/media/FilePreviewModal.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	/** Attachments per message; the preview modal splits anything above this. */
	const MAX_FILES = 10;

	// The paperclip and everything behind it. Picking files opens the preview
	// immediately, so the composer never sits holding files of its own — which is
	// why the selection lives here and not in the field.
	interface Props {
		/** The composer's text, shared so a started message carries into the preview. */
		text?: string;
		onsend: (files: File[], text: string) => void;
	}

	let { text = $bindable(''), onsend }: Props = $props();

	let input = $state<HTMLInputElement>();
	let files = $state<File[]>([]);

	function select(e: Event) {
		const el = e.target as HTMLInputElement;
		if (!el.files || el.files.length === 0) return;
		files = Array.from(el.files).slice(0, MAX_FILES);
		// Clear it, or picking the same file twice in a row fires no change event.
		el.value = '';
	}

	function confirm(confirmed: File[], caption: string) {
		files = [];
		onsend(confirmed, caption);
	}
</script>

<input
	bind:this={input}
	type="file"
	multiple
	class="file-input-hidden"
	onchange={select}
	accept="image/*,.pdf,.txt,.zip,.rar,.mp3,.ogg,.wav,.mp4,.webm"
/>

<ButtonIcon
	variant="glass"
	size="lg"
	title={t.chat.attachFile}
	onclick={(e: MouseEvent) => { e.stopPropagation(); input?.click(); }}
>
	<Paperclip size={20} />
</ButtonIcon>

{#if files.length > 0}
	<FilePreviewModal
		{files}
		bind:text
		onconfirm={confirm}
		onclose={() => (files = [])}
	/>
{/if}

<style>
	.file-input-hidden {
		display: none;
	}
</style>
