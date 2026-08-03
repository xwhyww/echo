<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	interface Props extends HTMLTextareaAttributes {
		value?: string;
		el?: HTMLTextAreaElement | null;
		/** Grow with the content up to `maxHeight`, then scroll. Off = fixed box. */
		autoresize?: boolean;
		/** Any CSS length. Only meaningful while `autoresize` is on. */
		maxHeight?: string;
	}

	let {
		value = $bindable(''),
		el = $bindable(null),
		autoresize = true,
		maxHeight = '150px',
		rows = 1,
		class: className = '',
		...rest
	}: Props = $props();

	function resize() {
		if (!el) return;
		if (!autoresize) {
			el.style.height = '';
			return;
		}
		// Collapse before measuring: scrollHeight can't report a shorter content
		// box while the element is still holding the taller height open, so
		// without this the field grows but never shrinks back.
		el.style.height = 'auto';
		el.style.height = `${el.scrollHeight}px`;
	}

	$effect(() => {
		// Tracked reads. Keying off `value` rather than an `oninput` handler is
		// deliberate: `input` only fires for typing, so a programmatic edit — an
		// emoji inserted at the caret, a prefilled draft in edit mode — would
		// otherwise leave the box at its old height.
		value;
		autoresize;
		maxHeight;
		resize();
	});
</script>

<textarea
	class="textarea body-sm {className} text-default"
	bind:this={el}
	bind:value
	{rows}
	style:max-height={autoresize ? maxHeight : null}
	{...rest}
></textarea>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.textarea {
		flex: 1;
		width: 100%;
		min-width: 0;
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-md);
		background: var(--c-bg-3);
		resize: none;
		outline: none;
		overflow-y: auto;
		transition: border-color var(--duration-fast) var(--ease-default);

		@include glass;

		border: 1px solid var(--c-accent-hover-opacity);
		box-shadow: none;
	}

	.textarea::placeholder {
		color: var(--c-text-faint);
	}

	.textarea:focus {
		border-color: var(--c-accent-text);
	}

	.textarea:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>