<script lang="ts">
	import { Pin } from 'lucide-svelte';
	import type { Attachment, ReplyToSnapshot, ForwardedFrom, MessageReaction } from '$lib/api/personalChats.js';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import ChatBubbleContent from '$lib/components/chat/ChatBubbleContent.svelte';
	import MessageContextMenu from '$lib/components/chat/MessageContextMenu.svelte';
	import MessageSelectMark from '$lib/components/chat/MessageSelectMark.svelte';
	import type { SeenByEntry } from '$lib/components/chat/MessageContextMenu.svelte';
	import { longpress } from '$lib/actions/longpress.js';
	import { useChatBubble } from '$lib/hooks/chat/useChatBubble.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	export type { SeenByEntry };

	interface Props {
		id?: string;
		content: string;
		attachments?: Attachment[];
		authorName: string;
		/** Who to open when the avatar is tapped. Without it the avatar is inert. */
		authorId?: string | null;
		avatarUrl?: string | null;
		time: string;
		own?: boolean;
		read?: boolean;
		isEdited?: boolean;
		showAvatar?: boolean;
		hideAvatar?: boolean;
		/**
		 * Which side the message sits on. Defaults to following `own`, which is
		 * right for a conversation between two people — but not for saved
		 * messages, where every message is your own and a column pinned to the
		 * right edge is just a column in the wrong place.
		 */
		align?: 'start' | 'end';
		/**
		 * Names the author above the message. For group surfaces, where the
		 * avatar alone does not say who is speaking.
		 */
		showAuthor?: boolean;
		isPinned?: boolean;
		replyToId?: string | null;
		replyToSnapshot?: ReplyToSnapshot | null;
		forwardedFrom?: ForwardedFrom | null;
		reactions?: MessageReaction[];
		currentUserId?: string | null;
		reactorLookup?: (userId: string) => { name: string; avatarUrl: string | null } | null;
		seenBy?: SeenByEntry[];
		selecting?: boolean;
		selected?: boolean;
		onselect?: (id: string) => void;
		onforward?: () => void;
		ondelete?: () => void;
		onedit?: (content: string, attachments: Attachment[]) => void;
		onpin?: () => void;
		onunpin?: () => void;
		onreply?: () => void;
		onreact?: (emoji: string) => void;
		onopenemoji?: () => void;
		onreplyjump?: (messageId: string) => void;
		onmedia?: (attachments: Attachment[], index: number) => void;
		onmention?: (username: string) => void;
		onuserclick?: (userId: string) => void;
	}

	let {
		id, content, attachments = [], authorName, authorId = null, avatarUrl, time, own = false, read = false,
		isEdited = false, showAvatar = true, hideAvatar = false, align, showAuthor = false,
		isPinned = false, replyToId,
		replyToSnapshot, forwardedFrom, reactions = [], currentUserId = null, reactorLookup,
		seenBy = [], selecting = false, selected = false, onselect, onforward, ondelete, onedit,
		onpin, onunpin, onreply, onreact, onopenemoji, onreplyjump, onmedia, onmention, onuserclick,
	}: Props = $props();

	const bubble = useChatBubble({
		content: () => content,
		attachments: () => attachments,
		reactions: () => reactions,
		currentUserId: () => currentUserId,
		reactorLookup: () => reactorLookup,
		time: () => time,
		own: () => own,
		selecting: () => selecting,
		replyToId: () => replyToId,
		onreact: () => onreact,
		onreplyjump: () => onreplyjump,
		onmedia: () => onmedia,
	});

	// The same props reach the bubble body twice — in the column and in the
	// menu's preview — so they are gathered once.
	const contentProps = $derived({
		bubble, content, attachments, authorName, time, own, read, isEdited,
		replyToId, replyToSnapshot, forwardedFrom, reactions, currentUserId,
		reactorLookup, onmention, onuserclick, showAuthor,
	});

	// `own` is only the default: saved messages are all your own and still belong
	// on the left.
	const alignEnd = $derived((align ?? (own ? 'end' : 'start')) === 'end');
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	class="bubble-row"
	class:selecting
	class:selected
	data-msg-id={id}
	oncontextmenu={bubble.handleRowContextMenu}
	use:longpress={{ onlongpress: bubble.handleLongPress, enabled: () => !selecting }}
>
	{#if selecting}
		<MessageSelectMark checked={selected} />
	{/if}

	<div
		class="bubble"
		class:own
		class:align-end={alignEnd}
		class:media={bubble.mediaAttachments.length > 0}
		class:solo-photo={bubble.mediaAttachments.length === 1}
		class:pinned={isPinned}
		data-msg-id={id}
		oncontextmenu={(e) => {
			if (!selecting) bubble.openContextMenu(e, { kind: 'bubble' });
		}}
		ondblclick={bubble.handleBubbleDblClick}
		onpointerup={bubble.handleBubblePointerUp}
	>
		{#if isPinned}
			<div class="pin-indicator text-accent" title={t.chat.pinned}><Pin size={16} /></div>
		{/if}

		{#if showAvatar}
			<!-- A button only when there is someone to open: on the stacked
			     messages the slot is kept but empty, and a target that leads
			     nowhere would still swallow the press. `stopPropagation` because
			     the bubble beneath opens the menu on its own presses. -->
			<div class="avatar-slot" class:hideAvatar>
				{#if authorId && onuserclick && !hideAvatar}
					<button
						class="avatar-btn"
						onclick={(e) => {
							e.stopPropagation();
							onuserclick(authorId);
						}}
						title={authorName}
						aria-label={authorName}
					>
						<Avatar name={authorName} {avatarUrl} size={32} />
					</button>
				{:else}
					<Avatar name={authorName} {avatarUrl} size={32} />
				{/if}
			</div>
		{/if}

		<ChatBubbleContent {...contentProps} />
	</div>
</div>

{#snippet contextPreview()}
	<!-- Which message the menu acts on. The centred menu no longer touches the
	     bubble it came from, so it has to be restated here. -->
	<div class="context-preview">
		<div class="bubble" class:own class:pinned={isPinned}>
			<ChatBubbleContent {...contentProps} />
		</div>
	</div>
{/snippet}

{#if bubble.showContextMenu}
	<MessageContextMenu
		preview={contextPreview}
		{...bubble.menuProps}
		{isPinned}
		{seenBy}
		onclose={bubble.closeMenu}
		{onpin}
		{onunpin}
		{onreply}
		{onforward}
		oncopy={() => navigator.clipboard.writeText(content)}
		ondownload={bubble.download}
		onedit={() => onedit?.(content, attachments)}
		{ondelete}
		{onreact}
		{onopenemoji}
		onselect={onselect && id ? () => onselect(id) : undefined}
		{onuserclick}
	/>
{/if}

<style lang="scss">
	@use '$lib/styles/bubble.mixin' as *;

	.bubble-row {
		display: flex;
		align-items: center;
		width: 100%;
		padding: var(--sp-1) 0;
		border-radius: var(--radius-md);
		transition: background var(--duration-fast) var(--ease-default);
	}

	/* On touch, the browser's own long-press behaviour (the iOS callout, the
	   Android selection handles) races our gesture. Suppressing it costs
	   drag-to-select, which touch users reach through the menu's Copy anyway.
	   Left alone on mouse, where selecting message text still matters. */
	@media (pointer: coarse) {
		.bubble-row {
			-webkit-touch-callout: none;
			user-select: none;
		}
	}

	.bubble-row.selecting {
		cursor: pointer;
		user-select: none;
	}

	.bubble-row.selected {
		background: var(--c-accent-subtle);
	}

	.bubble {
		@include bubble-row;
		contain: layout style paint;
		position: relative;
		/* Suppress double-tap-to-zoom so the second tap lands as a reaction. */
		touch-action: manipulation;
		/* Between the avatar and the message. Applies to the stacked messages too,
		   where the slot is kept but empty, so a run of replies from one person
		   stays aligned with the first. The pin indicator is absolutely
		   positioned and so is untouched by this. */
		gap: var(--sp-2);
	}

	/* The 70% cap in `bubble-row` is sized for text, where a long line reaching
	   most of the way across is hard to read. A photo is not text: it is the
	   message, and the cap is the only thing keeping it small — the grid inside
	   is already at 100% of whatever it is given. So media bubbles are allowed
	   wider, and a lone photo, with nothing to share the width with, widest. */
	.bubble.media {
		max-width: 85%;
	}

	.bubble.solo-photo {
		max-width: 92%;
	}

	.pin-indicator {
		position: absolute;
		top: 6px;
		margin-left: 6px;
		width: 18px;
		height: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.bubble.own .pin-indicator {
		left: -4px;
		right: auto;
	}

	.avatar-slot {
		flex-shrink: 0;
	}

	.avatar-btn {
		display: block;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		border-radius: var(--radius-full);
	}

	.hideAvatar {
		opacity: 0;
	}

	.context-preview {
		display: flex;
		max-width: 100%;
		min-height: 0;
		overflow: hidden;
		/* A restatement of the message, not a second copy to interact with —
		   clicks fall through to the overlay and dismiss, as anywhere else. */
		pointer-events: none;
		user-select: none;
	}

	/* Your own messages against the right edge, everyone else's against the left.
	   `margin-left: auto` rather than `justify-content` on the row, because the
	   row also carries the selection mark, which belongs on the left whichever
	   side the message is on — the margin moves the bubble alone and leaves the
	   mark where it is. */
	.bubble.align-end {
		margin-left: auto;
		/* Mirrored: the avatar belongs on the outer side of the message, which for
		   your own is the right. Reversing the row rather than reordering the
		   markup keeps one source order for both sides — and so one reading order
		   for a screen reader, where the author still comes before what they
		   said. The gap between them is unaffected. */
		flex-direction: row-reverse;
	}

	/* Undo the column alignment the bubble normally inherits from .bubble-row,
	   and let it use the full preview width rather than 70% of it. The preview is
	   centred in the menu, so the margin above has to go too. */
	.context-preview .bubble {
		max-width: 100%;
		margin-left: 0;
	}

	/* Mobile: let long messages use most of the row. */
	@media (max-width: 767px) {
		.bubble {
			max-width: 92%;
		}
	}
</style>
