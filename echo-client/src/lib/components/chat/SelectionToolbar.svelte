<script lang="ts">
	import { Forward, Trash2, X } from 'lucide-svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// The bar that replaces the message input while messages are multi-selected.
	// Shared by the personal-chat page and the group ChatPanel — both drive it
	// from the same useMessageSelection hook.
	let {
		count,
		onforward,
		ondelete,
		oncancel,
	}: {
		count: number;
		onforward: () => void;
		ondelete: () => void;
		oncancel: () => void;
	} = $props();
</script>

<div class="selection-toolbar">
	<span class="selection-count body-sm fw-medium text-muted">{count} selected</span>
	<div class="selection-actions">
		<button class="selection-forward-btn body-sm text-accent" onclick={onforward}>
			<Forward size={14} />
		</button>
		<button class="selection-delete-btn body-sm" onclick={ondelete}>
			<Trash2 size={14} />
		</button>
		<button class="selection-cancel-btn body-sm text-muted" onclick={oncancel}>
			<X size={14} />
			{t.common.cancel}
		</button>
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.selection-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-xl);

		@include glass;
	}

	.selection-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	
	.selection-count {
		min-width: max-content;
		margin-right: var(--sp-2);
	}
	
	.selection-forward-btn,
	.selection-delete-btn,
	.selection-cancel-btn {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-1) var(--sp-2);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);
		min-width: 60px;
		justify-content: center;
	}

	.selection-forward-btn {
		background: var(--c-accent-subtle);
	}
	.selection-forward-btn:hover {
		background: var(--c-accent-subtle-2);
	}

	.selection-delete-btn {
		background: rgba(239, 68, 68, 0.15);
		color: #ef4444;
	}
	.selection-delete-btn:hover {
		background: rgba(239, 68, 68, 0.25);
	}

	.selection-cancel-btn {
		background: none;
	}
	.selection-cancel-btn:hover {
		background: var(--c-bg-3);
		color: var(--c-text);
	}
</style>
