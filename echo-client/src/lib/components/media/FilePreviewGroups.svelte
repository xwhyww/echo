<script lang="ts">
	import { AlertTriangle } from 'lucide-svelte';
	import FilePreviewCard from '$lib/components/media/FilePreviewCard.svelte';
	import type { PreviewGroup, PreviewItem } from '$lib/utils/filePreview.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		groups: PreviewGroup[];
		/** Sending splits a mixed selection into one message per row; editing doesn't. */
		splitInto?: number;
		onremove: (item: PreviewItem) => void;
	}

	let { groups, splitInto = 0, onremove }: Props = $props();
</script>

{#if splitInto > 1}
	<div class="split-warning body-xs text-accent">
		<AlertTriangle size={16} />
		<span>{t.chat.willSplit(splitInto)}</span>
	</div>
{/if}

{#each groups as group (group.kind)}
	<div class="file-group">
		<span class="group-label body-xs text-faint fw-semibold">
			{t.chat.fileGroups[group.kind]}{splitInto ? ` — ${t.chat.groupMessages(group.rows.length)}` : ''}
		</span>
		<div class="file-rows">
			{#each group.rows as row, i (i)}
				<div class="file-row" class:file-row-docs={group.column}>
					{#each row as item, j (j)}
						<FilePreviewCard {item} horizontal={group.column} onremove={() => onremove(item)} />
					{/each}
				</div>
			{/each}
		</div>
	</div>
{/each}

<style>
	.split-warning {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-3) var(--sp-4);
		background: var(--c-accent-subtle);
		border: 1px solid var(--c-accent-subtle-2);
		border-radius: var(--radius-md);
		margin-bottom: var(--sp-4);
	}

	.file-group {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.file-group + .file-group {
		margin-top: var(--sp-4);
	}

	.file-rows {
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
		width: 100%;
	}

	/* Media stacks near-flush, the way it will look tiled in the bubble. The gap
	   is a property because the cards divide the row by it to sit three across. */
	.file-row {
		--preview-row-gap: 2px;
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: var(--preview-row-gap);
		width: 100%;
	}

	/* Documents are separate rows, so they need air between them. */
	.file-row-docs {
		gap: var(--sp-2);
	}
</style>
