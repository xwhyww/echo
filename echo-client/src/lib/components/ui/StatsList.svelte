<script lang="ts" module>
	import { MessageSquare } from 'lucide-svelte';

	// A single row in the chat/group "info" stat list. `action` (if present)
	// runs on click; otherwise a row with a `mediaKind` and a non-zero value
	// opens the corresponding media gallery via the parent's `onmedia`.
	export interface StatItem {
		icon: typeof MessageSquare;
		label: string;
		value: number;
		mediaKind?: 'photos' | 'videos' | 'gifs' | 'audio' | 'files' | 'links';
		action?: () => void;
	}
</script>

<script lang="ts">
	let {
		items,
		onmedia,
	}: {
		items: StatItem[];
		onmedia: (kind: NonNullable<StatItem['mediaKind']>) => void;
	} = $props();
</script>

<div class="stats-section">
	{#each items as item}
		{@const clickable = item.action || (item.mediaKind && item.value > 0)}
		{#if clickable}
			<button
				class="stat-row stat-row-button body-sm text-default"
				onclick={() => (item.action ? item.action() : onmedia(item.mediaKind!))}
			>
				<div class="stat-left text-muted">
					<item.icon size={18} />
					<span>{item.label}</span>
				</div>
				<span class="stat-value text-muted">{item.value.toLocaleString()}</span>
			</button>
		{:else}
			<div class="stat-row body-sm text-default">
				<div class="stat-left text-muted">
					<item.icon size={18} />
					<span>{item.label}</span>
				</div>
				<span class="stat-value text-muted">{item.value.toLocaleString()}</span>
			</div>
		{/if}
	{/each}
</div>

<style>
	.stats-section {
		display: flex;
		flex-direction: column;
	}

	.stat-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--sp-3) var(--sp-2);
		border-bottom: 1px solid var(--c-border);
		width: 100%;
		text-align: left;
		background: none;
		border-left: none;
		border-right: none;
		border-top: none;
	}

	.stat-row-button {
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);
	}

	.stat-left {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.stat-left span {
		color: var(--c-text);
	}

	.stat-value {
		font-variant-numeric: tabular-nums;
	}
</style>
