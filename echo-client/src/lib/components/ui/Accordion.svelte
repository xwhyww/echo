<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronRight } from 'lucide-svelte';

	interface Props {
		title: string;
		open?: boolean;
		children: Snippet;
		actions?: Snippet;
	}

	let { title, open = $bindable(true), children, actions }: Props = $props();
</script>

<div class="accordion">
	<button class="accordion-header body-xs overline fw-semibold text-muted" onclick={() => open = !open}>
		<span class="chevron" class:open>
			<ChevronRight size={16} />
		</span>
		<span class="accordion-title">{title}</span>
		{#if actions}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<span class="accordion-actions" onclick={(e) => e.stopPropagation()}>
				{@render actions()}
			</span>
		{/if}
	</button>
	{#if open}
		<div class="accordion-content">
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.accordion {
		display: flex;
		flex-direction: column;
	}

	.accordion-header {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		padding: var(--sp-2) var(--sp-3);
		transition: color var(--duration-fast) var(--ease-default);
	}

	.accordion-header:hover {
		color: var(--c-text);
	}

	.chevron {
		display: flex;
		align-items: center;
		transition: transform var(--duration-base) var(--ease-default);
	}

	.chevron.open {
		transform: rotate(90deg);
	}

	.accordion-title {
		flex: 1;
		text-align: left;
	}

	.accordion-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		opacity: 0;
		transition: opacity var(--duration-fast) var(--ease-default);
	}

	.accordion-header:hover .accordion-actions {
		opacity: 1;
	}

	.accordion-content {
		display: flex;
		flex-direction: column;
	}
</style>
