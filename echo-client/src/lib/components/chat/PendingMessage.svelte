<script lang="ts">
	import Avatar from '$lib/components/user/Avatar.svelte';
	import BubbleMediaGrid from '$lib/components/chat/BubbleMediaGrid.svelte';
	import FileAttachment from '$lib/components/media/FileAttachment.svelte';
	import UploadOverlay from '$lib/components/chat/UploadOverlay.svelte';
	import { usePendingAttachments } from '$lib/hooks/chat/usePendingAttachments.svelte.js';
	import { isMedia } from '$lib/utils/attachmentKind.js';

	// A message the user has sent but the server does not have yet. It is
	// deliberately the same bubble as the settled one — same collage, same file
	// strips, same surface — so nothing shifts at the moment the upload lands.
	// What it adds is the progress overlay, and what it drops is everything that
	// needs a stored message: reactions, the footer, the context menu.
	interface Props {
		files: File[];
		text: string;
		/** 0–100, of the whole task rather than any one file. */
		progress: number;
		processing?: boolean;
		failed?: boolean;
		authorName: string;
		avatarUrl?: string | null;
		oncancel: () => void;
		onretry?: () => void;
		onremove?: () => void;
	}

	let {
		files,
		text,
		progress,
		processing = false,
		failed = false,
		authorName,
		avatarUrl,
		oncancel,
		onretry,
		onremove,
	}: Props = $props();

	const pending = usePendingAttachments(() => files);

	// Read off the picked files rather than off `pending`, whose blob URLs only
	// exist from the first effect onwards: the bubble has to be the right shape
	// on the frame it appears, and only the tiles inside it may fill in later.
	const hasMedia = $derived(files.some((f) => isMedia({ mimeType: f.type })));
	const hasFiles = $derived(files.some((f) => !isMedia({ mimeType: f.type })));
	// Nothing but photos means nothing sits under the collage, so it keeps its
	// bottom corners and there is no text surface to draw at all.
	const mediaOnly = $derived(hasMedia && !hasFiles && !text.trim());
</script>

{#snippet overlay()}
	<UploadOverlay {progress} {processing} {failed} {oncancel} {onretry} {onremove} />
{/snippet}

<div class="bubble">
	<div class="avatar-slot">
		<Avatar name={authorName} {avatarUrl} size={22} />
	</div>

	<div class="bubble-body" class:has-media={hasMedia}>
		{#if hasMedia}
			<div class="message-body">
				<BubbleMediaGrid
					attachments={pending.media}
					hasContentBelow={!mediaOnly}
					tileOverlay={overlay}
				/>
			</div>
		{/if}

		{#if !mediaOnly}
			<div class="message-body">
				<div class="bubble-content body-sm" class:has-attachments={hasMedia}>
					{#if pending.files.length > 0}
						<div class="attachment-stack" class:has-content={!!text.trim()}>
							{#each pending.files as file (file.id)}
								<FileAttachment filename={file.filename} size={file.size}>
									{#snippet trailing()}
										<div class="file-progress">
											<div class="file-progress-bar" style:width="{progress}%"></div>
										</div>
									{/snippet}
								</FileAttachment>
							{/each}
						</div>
					{/if}
					{text}
				</div>
			</div>
		{/if}
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/bubble.mixin' as *;

	.bubble {
		@include bubble-row;
		align-self: flex-start;
	}

	.avatar-slot {
		flex-shrink: 0;
	}

	.bubble-body {
		display: flex;
		flex-direction: column;
		border-radius: var(--radius-md);
		min-width: 0;
	}

	.bubble-body.has-media {
		width: 320px;
	}

	.message-body {
		display: flex;
		flex-direction: row;
		align-items: flex-end;
		min-width: 0;
	}

	.bubble-content {
		/* Always the own gradient: the only pending message anyone sees is theirs. */
		@include bubble-content(var(--grad-bubble-own));
	}

	.bubble-content.has-attachments {
		@include bubble-content-under-media;
	}

	.attachment-stack {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.attachment-stack.has-content {
		margin-bottom: var(--sp-2);
	}

	.file-progress {
		width: 48px;
		height: 3px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 2px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.file-progress-bar {
		height: 100%;
		background: white;
		transition: width 0.15s ease;
	}

	@media (max-width: 767px) {
		.bubble-body.has-media {
			width: 100%;
		}
	}
</style>
