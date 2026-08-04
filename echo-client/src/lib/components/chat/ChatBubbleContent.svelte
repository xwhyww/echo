<script lang="ts">
	import { resolveUrl } from '$lib/api/client';
	import AudioAttachment from '$lib/components/audio/AudioAttachment.svelte';
	import BubbleFooter from '$lib/components/chat/BubbleFooter.svelte';
	import BubbleMediaGrid from '$lib/components/chat/BubbleMediaGrid.svelte';
	import BubbleText from '$lib/components/chat/BubbleText.svelte';
	import FileAttachment from '$lib/components/media/FileAttachment.svelte';
	import ForwardStrip from '$lib/components/chat/ForwardStrip.svelte';
	import ReplyStrip from '$lib/components/chat/ReplyStrip.svelte';
	import VoiceMessage from '$lib/components/audio/VoiceMessage.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { useChatBubble, ClickTarget } from '$lib/hooks/chat/useChatBubble.svelte.js';
	import type {
		Attachment,
		ReplyToSnapshot,
		ForwardedFrom,
		MessageReaction,
	} from '$lib/api/personalChats.js';

	const t = $derived(i18n.t);

	// Everything inside a bubble's rounded box. Rendered twice — once in the
	// message column, once as the preview under the context menu — so it holds no
	// state of its own; the hook it is handed owns all of it.
	interface Props {
		bubble: ReturnType<typeof useChatBubble>;
		content: string;
		attachments?: Attachment[];
		authorName: string;
		time: string;
		own?: boolean;
		read?: boolean;
		isEdited?: boolean;
		replyToId?: string | null;
		replyToSnapshot?: ReplyToSnapshot | null;
		forwardedFrom?: ForwardedFrom | null;
		reactions?: MessageReaction[];
		currentUserId?: string | null;
		reactorLookup?: (userId: string) => { name: string; avatarUrl: string | null } | null;
		onmention?: (username: string) => void;
		onuserclick?: (userId: string) => void;
	}

	let {
		bubble,
		content,
		attachments = [],
		authorName,
		time,
		own = false,
		read = false,
		isEdited = false,
		replyToId,
		replyToSnapshot,
		forwardedFrom,
		reactions = [],
		currentUserId = null,
		reactorLookup,
		onmention,
		onuserclick,
	}: Props = $props();

	const hasMedia = $derived(bubble.mediaAttachments.length > 0);
	const hasText = $derived(!!content.trim());
	// A lone emoji renders bare — no surface, no padding — but only when there
	// is nothing else in the bubble to sit against.
	const bareEmoji = $derived(
		bubble.isEmojiOnly && attachments.length === 0 && !replyToSnapshot && !forwardedFrom,
	);

	function openMenu(target: ClickTarget) {
		return (e: MouseEvent) => bubble.openContextMenu(e, target);
	}
</script>

<div class="bubble-body" class:own class:has-media={hasMedia}>
	<!-- A forward banner rides above the collage when there is one, and inside
	     the text surface otherwise. -->
	{#if forwardedFrom && hasMedia}
		<ForwardStrip {forwardedFrom} {onuserclick} />
	{/if}

	{#if hasMedia}
		<div class="message-body">
			<BubbleMediaGrid
				attachments={bubble.mediaAttachments}
				hasContentBelow={!bubble.mediaOnly}
				onopen={bubble.openMedia}
				oncontextmenu={(e, attachment) => bubble.openContextMenu(e, { kind: 'media', attachment })}
			/>
		</div>
	{/if}

	{#if !bubble.mediaOnly || replyToSnapshot}
		<div class="message-body">
			<div
				class="bubble-content body-sm"
				class:emoji-only={bareEmoji}
				class:has-attachments={hasMedia}
			>
				{#if forwardedFrom && !hasMedia}
					<ForwardStrip {forwardedFrom} {onuserclick} />
				{/if}

				{#if replyToSnapshot}
					<ReplyStrip
						snapshot={replyToSnapshot}
						clickable={!!replyToId}
						onjump={bubble.handleReplyJump}
					/>
				{/if}

				{#if bubble.voiceAttachments.length > 0}
					<div class="attachment-stack" class:has-content={hasText}>
						{#each bubble.voiceAttachments as v (v.id)}
							{#if v.voice}
								<VoiceMessage
									id={v.id}
									url={v.url}
									duration={v.voice.duration}
									peaks={v.voice.peaks}
									size={v.size}
									{own}
									{authorName}
								/>
							{/if}
						{/each}
					</div>
				{/if}

				{#if bubble.audioAttachments.length > 0}
					<div class="attachment-stack" class:has-content={hasText}>
						{#each bubble.audioAttachments as a (a.id)}
							<AudioAttachment id={a.id} url={a.url} filename={a.filename} size={a.size} {own} {authorName} />
						{/each}
					</div>
				{/if}

				{#if bubble.fileAttachments.length > 0}
					<div class="attachment-stack files" class:has-content={hasText}>
						{#each bubble.fileAttachments as file (file.id)}
							<FileAttachment
								filename={file.filename}
								size={file.size}
								href={resolveUrl(file.url)}
								download={file.filename}
								title={t.chat.clickToOpen}
								hint={t.chat.clickToOpen}
								attId={file.id}
								oncontextmenu={(e) => bubble.openContextMenu(e, { kind: 'file', file })}
							/>
						{/each}
					</div>
				{/if}

				{#if content}
					<BubbleText
						{content}
						emojiOnly={bubble.isEmojiOnly}
						{own}
						{onmention}
						oncontextmenu={openMenu({ kind: 'text' })}
					/>
				{/if}

				<BubbleFooter
					{reactions}
					{currentUserId}
					{reactorLookup}
					{own}
					{time}
					{read}
					{isEdited}
					onreact={bubble.handleReactionClick}
				/>
			</div>
		</div>
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/bubble.mixin' as *;

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
		@include bubble-content;
	}

	.bubble-body.own .bubble-content {
		background: var(--grad-bubble-own);
		color: var(--c-text);
	}

	.bubble-content.has-attachments {
		@include bubble-content-under-media;
	}

	.bubble-content.emoji-only,
	.bubble-body.own .bubble-content.emoji-only {
		background: transparent;
		box-shadow: none;
		padding: 0;
	}

	.attachment-stack {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.attachment-stack.files {
		gap: var(--sp-1);
	}

	.attachment-stack.has-content {
		margin-bottom: var(--sp-2);
	}

	@media (max-width: 767px) {
		.bubble-body.has-media {
			width: 100%;
		}
	}
</style>
