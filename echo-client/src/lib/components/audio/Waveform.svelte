<script lang="ts">
	// A recording's peaks as a row of bars, filled up to the playhead. Shared by
	// the voice bubble and the docked player so the same recording never looks
	// like two different waveforms.
	interface Props {
		/** Peak heights in percent, as recorded. */
		peaks: number[];
		/** Playhead position, 0–1. */
		progress: number;
		onseek?: (e: MouseEvent) => void;
		/** Height of the clickable strip, not of the bars — they scale to it. */
		height?: string;
		/** Take the free space in its row instead of sitting at natural width. */
		grow?: boolean;
		/** Inside an own (accent) bubble, where accent-on-accent would vanish. */
		own?: boolean;
	}

	let { peaks, progress, onseek, height = '22px', grow = false, own = false }: Props = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="bars" class:grow class:own class:seekable={!!onseek} style:height onclick={onseek}>
	{#each peaks as p, i}
		{@const filled = i / peaks.length < progress}
		<!-- A bar under 10% is a hairline nobody can see, so silence still shows. -->
		<span class="bar" class:filled style="height: {Math.max(10, p)}%"></span>
	{/each}
</div>

<style>
	.bars {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.bars.seekable {
		cursor: pointer;
	}

	.bars.grow {
		flex: 1;
		width: 100px;
	}

	.bar {
		flex: 1;
		min-width: 2px;
		max-width: 3px;
		background: var(--c-text-faint);
		border-radius: 2px;
		transition: background var(--duration-fast) var(--ease-default);
	}

	.bar.filled {
		background: var(--c-accent);
	}

	.own .bar {
		background: var(--c-on-accent-faint);
	}

	.own .bar.filled {
		background: var(--c-text-inverse);
	}
</style>
