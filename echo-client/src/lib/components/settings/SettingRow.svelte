<script lang="ts">
	import type { Snippet } from 'svelte';

	// A labelled setting: what it is, what it means, and the control that changes
	// it. Rows separate themselves with a rule, so a stack of them needs no
	// wrapper styling.
	interface Props {
		label: string;
		desc?: string;
		/** Short qualifier beside the label — "Native", "Beta", "AI". */
		badge?: string;
		/**
		 * `stacked` puts the control under the description, for wide controls like
		 * a segmented picker. `inline` keeps it at the end of the row, for a switch.
		 */
		layout?: 'stacked' | 'inline';
		children: Snippet;
	}

	let { label, desc, badge, layout = 'stacked', children }: Props = $props();
</script>

<div class="setting-row setting-row-{layout}">
	<div class="setting-row-info">
		<div class="setting-row-label">
			<span class="body-sm fw-medium">{label}</span>
			{#if badge}
				<span class="setting-row-badge body-xxs overline fw-semibold text-accent">{badge}</span>
			{/if}
		</div>
		{#if desc}
			<span class="body-xs lh-base text-faint">{desc}</span>
		{/if}
	</div>
	{@render children()}
</div>

<style>
	.setting-row {
		display: flex;
		gap: var(--sp-3);
		padding-bottom: var(--sp-5);
		border-bottom: 1px solid var(--c-border);
	}

	.setting-row:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	.setting-row-stacked {
		flex-direction: column;
	}

	.setting-row-inline {
		align-items: flex-start;
		gap: var(--sp-4);
		padding: var(--sp-4) 0;
	}

	.setting-row-inline:last-child {
		padding-bottom: var(--sp-4);
	}

	.setting-row-info {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		flex: 1;
		min-width: 0;
	}

	.setting-row-label {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.setting-row-badge {
		padding: 2px 6px;
		border-radius: var(--radius-full);
		background: var(--c-accent-subtle);
	}
</style>
