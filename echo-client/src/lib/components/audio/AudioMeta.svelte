<script lang="ts">
	import { formatDuration } from '$lib/utils/voiceRecording';
	import { formatSize } from '$lib/utils.js';

	// The line under a playable attachment: how long it is (or how far in we
	// are), and how heavy. Both audio bubbles show exactly this.
	interface Props {
		seconds: number;
		size?: number;
		/** Inside an own (accent) bubble. */
		own?: boolean;
		/** Shown instead of a time while the length is still unknown. */
		placeholder?: string;
	}

	let { seconds, size, own = false, placeholder }: Props = $props();
</script>

<div class="meta body-xs {own ? 'text-on-accent-muted' : 'text-muted'}">
	<span class="time">{placeholder ?? formatDuration(seconds)}</span>
	{#if size}
		<span class="dot" aria-hidden="true">·</span>
		<span class="size">{formatSize(size)}</span>
	{/if}
</div>

<style>
	.meta {
		display: flex;
		align-items: center;
		gap: 4px;
		font-variant-numeric: tabular-nums;
	}

	.dot {
		opacity: 0.6;
	}
</style>
