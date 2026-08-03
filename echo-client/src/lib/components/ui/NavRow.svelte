<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronRight } from 'lucide-svelte';
	import BlockWrapper from '$lib/components/ui/BlockWrapper.svelte';

	// A row in a settings hub: icon, title, one line of explanation, chevron.
	// The whole row is the link.
	interface Props {
		href: string;
		title: string;
		desc?: string;
		icon?: Snippet;
	}

	let { href, title, desc, icon }: Props = $props();
</script>

<BlockWrapper padding="0" radius="var(--radius-lg)">
	<a class="nav-row" {href}>
		<span class="nav-row-text">
			<span class="nav-row-title body-base fw-medium">
				{#if icon}
					<span class="nav-row-icon text-accent">{@render icon()}</span>
				{/if}
				{title}
			</span>
			{#if desc}
				<span class="nav-row-desc body-xs text-faint">{desc}</span>
			{/if}
		</span>
		<ChevronRight size={16} />
	</a>
</BlockWrapper>

<style>
	.nav-row {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-lg);
		transition: background var(--duration-fast) var(--ease-default);
	}

	.nav-row-icon {
		display: inline-flex;
		flex-shrink: 0;
	}

	.nav-row-title {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.nav-row-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.nav-row-desc {
		display: block;
	}
</style>
