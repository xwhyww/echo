import { segmentAppleEmojis } from '$lib/utils/appleEmoji.js';

/**
 * The `contenteditable` behind the message field, where emoji are `<img>`
 * elements rather than characters — Apple's set is images, and the composer has
 * to show what the sent message will look like.
 *
 * That trade means the element's text and its DOM are two different things, so
 * everything here is about converting between them: writing a string in as
 * nodes, reading the nodes back out as a string, and inserting at the caret
 * without losing the caret.
 *
 * `element` is a getter because the editor is unmounted while a voice message
 * is being recorded.
 */
export function useEmojiEditor(element: () => HTMLElement | null | undefined) {
	function emojiImg(native: string, url: string): HTMLImageElement {
		const img = document.createElement('img');
		img.src = url;
		img.alt = native;
		img.className = 'input-emoji';
		img.draggable = false;
		// Without this the caret can land *inside* the image and typing goes
		// nowhere.
		img.contentEditable = 'false';
		return img;
	}

	function buildFragment(text: string): DocumentFragment {
		const frag = document.createDocumentFragment();
		for (const seg of segmentAppleEmojis(text)) {
			if (seg.type === 'emoji') frag.appendChild(emojiImg(seg.native, seg.url));
			else frag.appendChild(document.createTextNode(seg.value));
		}
		return frag;
	}

	/**
	 * The inverse: an emoji image contributes its `alt` (the native character),
	 * a `<br>` a newline, and a block element a line break before its contents —
	 * which is how browsers represent the lines a user made with Shift+Enter.
	 */
	function extractText(node: Node): string {
		let out = '';
		for (const child of Array.from(node.childNodes)) {
			if (child.nodeType === Node.TEXT_NODE) {
				out += child.textContent ?? '';
				continue;
			}
			if (child.nodeType !== Node.ELEMENT_NODE) continue;
			const el = child as HTMLElement;
			if (el.tagName === 'IMG') {
				out += el.getAttribute('alt') ?? '';
			} else if (el.tagName === 'BR') {
				out += '\n';
			} else if (el.tagName === 'DIV' || el.tagName === 'P') {
				if (out && !out.endsWith('\n')) out += '\n';
				out += extractText(el);
			} else {
				out += extractText(el);
			}
		}
		return out;
	}

	function placeCaretAtEnd(el: HTMLElement) {
		const range = document.createRange();
		range.selectNodeContents(el);
		range.collapse(false);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);
	}

	return {
		focus() {
			element()?.focus();
		},

		/** Current contents as plain text. */
		read(): string {
			const el = element();
			return el ? extractText(el) : '';
		},

		/** Replace the contents wholesale — a draft being restored, or a send clearing it. */
		render(text: string) {
			const el = element();
			if (!el) return;
			while (el.firstChild) el.removeChild(el.firstChild);
			el.appendChild(buildFragment(text));
		},

		/**
		 * Insert at the caret, leaving it after what was inserted. With no live
		 * selection inside the editor — a picker click, say — it appends instead.
		 */
		insert(text: string) {
			const el = element();
			if (!el) return;
			const frag = buildFragment(text);
			const sel = window.getSelection();

			if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
				el.appendChild(frag);
				// Moving the caret into an unfocused editor would focus it, and an
				// insert from outside (the emoji picker) must leave focus where the
				// user put it.
				if (document.activeElement === el) placeCaretAtEnd(el);
				return;
			}

			const range = sel.getRangeAt(0);
			range.deleteContents();
			const lastNode = frag.lastChild;
			range.insertNode(frag);
			if (!lastNode) return;
			const after = document.createRange();
			after.setStartAfter(lastNode);
			after.collapse(true);
			sel.removeAllRanges();
			sel.addRange(after);
		},
	};
}
