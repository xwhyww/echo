<script lang="ts">
	import type { Snippet } from 'svelte';

	// The label / control / hint stack that every form on every screen was
	// spelling out by hand. The control itself stays the caller's — this owns
	// only the labelling and the spacing around it.
	interface Props {
		/** Omit for a bare stack: an OTP box, or a control that labels itself. */
		label?: string;
		/** Fainter tail on the label — "(optional)". */
		note?: string;
		/** Explanatory line under the control. */
		hint?: string;
		/**
		 * The id of a control that carries its own. Given one, the wrapper is a
		 * plain div and the label points at it; without one the field wraps the
		 * control in a label, so clicking the text focuses it.
		 */
		for?: string;
		/** `page` labels sit on settings screens, `compact` ones inside modals. */
		variant?: 'page' | 'compact';
		children: Snippet;
	}

	let { label, note, hint, for: htmlFor, variant = 'compact', children }: Props = $props();
</script>

<svelte:element this={htmlFor ? 'div' : 'label'} class="field field-{variant}">
	{#if label}
		<svelte:element
			this={htmlFor ? 'label' : 'span'}
			for={htmlFor}
			class="field-label text-muted {variant === 'page' ? 'body-sm fw-medium' : 'body-xs'}"
		>
			{label}{#if note}&nbsp;<span class="text-faint">{note}</span>{/if}
		</svelte:element>
	{/if}
	{@render children()}
	{#if hint}<p class="field-hint body-sm text-faint">{hint}</p>{/if}
</svelte:element>

<style>
	.field {
		display: flex;
		flex-direction: column;
	}

	/* Inside a modal the label sits close to its control; on a page the whole
	   form is roomier and the labels need matching air. */
	.field-compact {
		gap: var(--sp-2);
	}

	.field-page {
		gap: var(--sp-1);
	}

	.field-hint {
		margin: 0;
	}
</style>
