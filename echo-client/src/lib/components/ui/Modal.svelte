<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from 'lucide-svelte';
	import { portal } from '$lib/actions/portal.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// Base modal shell: dimmed backdrop, centered card, optional icon badge,
	// title, description, a body (children) and an actions row. Closes on
	// Escape, on backdrop click and via the corner button. Field/body markup is
	// passed as children so it stays in the caller's style scope; the shell owns
	// only its own chrome.
	let {
		title,
		desc,
		onclose,
		icon,
		children,
		actions,
		closeOnBackdrop = true,
		closeDisabled = false,
		layout = 'form',
		tone = 'default',
		maxWidth,
	}: {
		title: string;
		desc?: string;
		onclose: () => void;
		icon?: Snippet;
		children?: Snippet;
		actions?: Snippet;
		closeOnBackdrop?: boolean;
		/**
		 * Seals every exit — Escape, backdrop and the corner button — while an
		 * action the dialog started is still in flight.
		 */
		closeDisabled?: boolean;
		/**
		 * `form` is the wide card that hosts fields and lists. `alert` is the
		 * narrow, roomier one for a single question, where the title carries the
		 * message rather than labelling a form.
		 */
		layout?: 'form' | 'alert';
		/** Tints the icon badge. `danger` marks a destructive question. */
		tone?: 'default' | 'danger';
		/**
		 * Caps the card width (any CSS length), overriding the layout's own
		 * ceiling. Dialogs whose body has an intrinsic layout — a multi-column
		 * grid, say — pass one here.
		 */
		maxWidth?: string;
	} = $props();

	function close() {
		if (!closeDisabled) onclose();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" use:portal onclick={() => closeOnBackdrop && close()}>
	<div
		class="modal modal-{layout}"
		style:max-width={maxWidth}
		onclick={(e) => e.stopPropagation()}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		<button class="modal-close text-muted" onclick={close} disabled={closeDisabled} aria-label={t.common.close}>
			<X size={18} />
		</button>
		{#if icon}
			<div class="modal-icon modal-icon-{tone}">{@render icon()}</div>
		{/if}
		<h2 class={layout === 'alert' ? 'heading-lg' : 'body-base'}>{title}</h2>
		{#if desc}
			<p class="modal-desc body-sm text-muted">{desc}</p>
		{/if}
		{@render children?.()}
		{#if actions}
			<div class="modal-actions">{@render actions()}</div>
		{/if}
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/modal.mixin' as *;

	.modal-backdrop {
		@include modal-backdrop;
		animation: fadeIn var(--duration-base) var(--ease-default);
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.modal {
		@include modal-surface;
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		animation: slideUp var(--duration-slow) var(--ease-default);
	}

	.modal-form {
		padding: var(--sp-3);
		width: calc(100% - var(--sp-4));
	}

	/* Roomier and narrower than a form: one question, nothing to scan. */
	.modal-alert {
		padding: var(--sp-6);
		width: calc(100% - var(--sp-4));
		max-width: 420px;
	}

	@keyframes slideUp {
		from { transform: translateY(8px); opacity: 0; }
		to { transform: translateY(0); opacity: 1; }
	}

	.modal h2 {
		margin: 0;
		/* Keep a long title clear of the close button. */
		padding-right: var(--sp-6);
	}

	.modal-close {
		position: absolute;
		top: var(--sp-2);
		right: var(--sp-2);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--sp-1);
		border: none;
		border-radius: var(--radius-sm, 4px);
		background: transparent;
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default),
			color var(--duration-fast) var(--ease-default);
	}

	.modal-close:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.modal-icon {
		width: 44px;
		height: 44px;
		border-radius: var(--radius-full);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.modal-icon-default {
		background: var(--c-accent-subtle);
		color: var(--c-accent-text);
	}

	.modal-icon-danger {
		background: color-mix(in srgb, var(--c-error) 15%, transparent);
		color: var(--c-error);
	}

	.modal-desc {
		margin: 0;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--sp-2);
		margin-top: var(--sp-3);
	}
</style>
