<script lang="ts">
	import type { Snippet } from 'svelte';
	import { FileText, Paperclip } from 'lucide-svelte';
	import { formatSize } from '$lib/utils.js';

	interface Props {
		filename: string;
		size: number;
		/** 'row' — the strip inside a chat bubble. 'card' — the tile in the file picker. */
		variant?: 'row' | 'card';
		/** Card only: lay the tile out left-to-right instead of stacked. */
		horizontal?: boolean;
		/** Present renders an <a>; absent renders a plain <div> — a file still
		 *  uploading has nothing to open yet. Hover affordances follow this. */
		href?: string | null;
		download?: string;
		title?: string;
		/** Mirrored onto `data-att-id`. ChatBubble resolves a long-press target by
		 *  walking up to `.attachment-file` and reading it back, so both the class
		 *  and this attribute are load-bearing there — see `targetUnder`. */
		attId?: string;
		/** Appended after the size, e.g. "Click to open". */
		hint?: string;
		oncontextmenu?: (e: MouseEvent) => void;
		/** Trailing content — the upload progress bar on a pending message. */
		trailing?: Snippet;
	}

	let {
		filename,
		size,
		variant = 'row',
		horizontal = false,
		href = null,
		download,
		title,
		attId,
		hint,
		oncontextmenu,
		trailing,
	}: Props = $props();

	const ext = $derived(filename.split('.').pop()?.toUpperCase() ?? '');
</script>

<!-- The compiler can't narrow `this`, so it assumes the static-div case might
     carry the context handler. In practice a context menu only ever comes with
     an `href`, which makes this a real <a> with an implicit link role. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<svelte:element
	this={href ? 'a' : 'div'}
	class="attachment-file"
	class:card={variant === 'card'}
	class:horizontal={variant === 'card' && horizontal}
	class:linked={!!href}
	href={href ?? undefined}
	{download}
	{title}
	target={href ? '_blank' : undefined}
	rel={href ? 'noopener noreferrer' : undefined}
	data-att-id={attId}
	{oncontextmenu}
>
	{#if variant === 'card'}
		<Paperclip size={20} />
		<span class="card-ext body-xs overline fw-semibold text-faint">{ext}</span>
		<span class="card-name body-xs">{filename}</span>
		<span class="body-xs text-faint">{formatSize(size)}</span>
	{:else}
		<FileText size={18} />
		<span class="info">
			<span class="file-name body-xs fw-medium">{filename}</span>
			<span class="file-size body-xs">{formatSize(size)}{hint ? ` · ${hint}` : ''}</span>
		</span>
	{/if}
	{@render trailing?.()}
</svelte:element>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.attachment-file {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2);
		background-color: var(--c-bubble-inset);
		text-decoration: none;
		color: inherit;

		@include glass;
		box-shadow: none;
		border-radius: var(--radius-md);

		width: 100%;
	}

	/* Only a resolvable file reacts to the pointer. A pending upload renders the
	 * same strip minus the affordances, so it can't advertise a click it can't
	 * honour. */
	.attachment-file.linked {
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-default),
			transform var(--duration-fast) var(--ease-default);
	}

	.attachment-file.linked:active {
		transform: translateY(0);
	}

	.info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.file-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-size {
		opacity: 0.6;
	}

	/* --- Card: the tile shown while picking files, before anything is sent --- */
	.attachment-file.card {
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		gap: var(--sp-1);
		width: 100%;
		min-width: 0;
		padding: var(--sp-3);
		border-radius: 12px;
		background: var(--c-bg-2);
		color: var(--c-text-muted);
	}

	.attachment-file.card.horizontal {
		flex-direction: row;
		gap: var(--sp-3);
	}

	.card-name {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
