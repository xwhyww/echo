<script lang="ts">
	import type { Snippet } from 'svelte';
	import { MoreVertical } from 'lucide-svelte';

	// A kebab button and the panel it opens. The panel is anchored to the button,
	// so the row that owns it needs no positioning of its own; a full-screen
	// backdrop catches the click that dismisses it.
	interface Props {
		open: boolean;
		ontoggle: () => void;
		onclose: () => void;
		label: string;
		children: Snippet;
	}

	let { open, ontoggle, onclose, label, children }: Props = $props();
</script>

<div class="menu-wrap">
	<button class="menu-btn text-muted" onclick={ontoggle} aria-label={label} aria-expanded={open}>
		<MoreVertical size={18} />
	</button>
	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="menu-backdrop" onclick={onclose}></div>
		<div class="menu body-sm">{@render children()}</div>
	{/if}
</div>

<style>
	.menu-wrap {
		position: relative;
		flex-shrink: 0;
	}

	.menu-btn {
		width: 32px;
		height: 32px;
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		cursor: pointer;
	}

	.menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: var(--z-overlay);
	}

	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 4px);
		min-width: 180px;
		background: var(--c-bg-2);
		border: 1px solid var(--c-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-xl);
		z-index: calc(var(--z-overlay) + 1);
		padding: var(--sp-1);
		display: flex;
		flex-direction: column;
	}

	/* Items are supplied by the caller, so they're styled from here. */
	.menu :global(button) {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		color: var(--c-text);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.menu :global(button.danger) {
		color: var(--c-error);
	}
</style>
