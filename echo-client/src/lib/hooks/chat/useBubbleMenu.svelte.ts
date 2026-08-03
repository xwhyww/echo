import { resolveUrl } from '$lib/api/client';
import type { Attachment } from '$lib/api/personalChats.js';
import type { LongPressDetail } from '$lib/actions/longpress.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';

/** What the menu was opened on — decides which items it offers. */
export type ClickTarget =
	| { kind: 'bubble' }
	| { kind: 'text' }
	| { kind: 'file'; file: Attachment }
	| { kind: 'media'; attachment: Attachment };

/**
 * Opening a message's context menu, and knowing what it was opened *on*.
 *
 * That second part is the whole job: the same menu offers "Download image",
 * "Download file", "Copy" or none of them depending on which part of the bubble
 * the press landed. A right click gets that for free from the element its
 * listener sits on; a long press arrives on the row and has to have it resolved
 * from whatever node was under the finger.
 */
export function useBubbleMenu(input: {
	content: () => string;
	attachments: () => Attachment[];
	selecting: () => boolean;
	/** Called before a long press opens the menu, so the release that ends the
	 *  press isn't mistaken for half of a double tap. */
	onbeforelongpress?: () => void;
}) {
	let open = $state(false);
	let selectOnly = $state(false);
	let clickTarget = $state<ClickTarget>({ kind: 'bubble' });

	const canCopy = $derived(clickTarget.kind === 'text' && !!input.content().trim());

	/** Which attachment the "Download" item acts on, and what it should read. */
	const downloadTarget = $derived.by(() => {
		if (clickTarget.kind === 'file') return { label: i18n.t.common.download, file: clickTarget.file };
		if (clickTarget.kind === 'media') {
			const a = clickTarget.attachment;
			return {
				label: a.mimeType.startsWith('video/') ? i18n.t.media.downloadVideo : i18n.t.media.downloadImage,
				file: a,
			};
		}
		return null;
	});

	/**
	 * The menu opens centred on screen rather than at the pointer. Anchoring to
	 * the cursor is unworkable for the long-press path — the menu lands under
	 * the finger that opened it — and a single placement keeps both input
	 * methods behaving the same.
	 */
	function openAt(target: ClickTarget, only: boolean) {
		clickTarget = target;
		selectOnly = only;
		open = true;
	}

	/**
	 * Order matches the nesting of the `oncontextmenu` handlers in the markup —
	 * innermost wins — so the two ways in agree on what was pressed.
	 */
	function targetUnder(node: HTMLElement | null): { target: ClickTarget; only: boolean } {
		const attachments = input.attachments();

		const fileEl = node?.closest<HTMLElement>('.attachment-file');
		const file = fileEl && attachments.find((a) => a.id === fileEl.dataset.attId);
		if (file) return { target: { kind: 'file', file }, only: false };

		const mediaEl = node?.closest<HTMLElement>('.attachment-image-wrapper');
		const attachment = mediaEl && attachments.find((a) => a.id === mediaEl.dataset.attId);
		if (attachment) return { target: { kind: 'media', attachment }, only: false };

		if (node?.closest('.bubble-text')) return { target: { kind: 'text' }, only: false };
		if (node?.closest('.bubble')) return { target: { kind: 'bubble' }, only: false };
		// Pressed the empty gutter beside the bubble — same as right-clicking it.
		return { target: { kind: 'bubble' }, only: true };
	}

	function download() {
		const file = downloadTarget?.file;
		if (!file) return;
		const href = resolveUrl(file.url);
		if (!href) return;
		const a = document.createElement('a');
		a.href = href;
		a.download = file.filename;
		a.target = '_blank';
		a.rel = 'noopener';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	return {
		get open() { return open; },
		get selectOnly() { return selectOnly; },
		get canCopy() { return canCopy; },
		get downloadLabel() { return downloadTarget?.label ?? null; },

		/** Right click on a known part of the bubble. */
		openOn(e: MouseEvent, target: ClickTarget) {
			e.preventDefault();
			e.stopPropagation();
			openAt(target, false);
		},

		/** Right click on the row, i.e. beside the bubble rather than on it. */
		openOnRow(e: MouseEvent) {
			if (input.selecting()) return;
			if ((e.target as HTMLElement).closest('.bubble')) return;
			e.preventDefault();
			e.stopPropagation();
			openAt({ kind: 'bubble' }, true);
		},

		openOnLongPress({ target }: LongPressDetail) {
			input.onbeforelongpress?.();
			window.getSelection()?.removeAllRanges();
			const { target: resolved, only } = targetUnder(target);
			openAt(resolved, only);
		},

		close() { open = false; },
		download,
	};
}
