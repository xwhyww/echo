<script lang="ts">
	import { segmentAppleEmojis } from '$lib/utils/appleEmoji';

	interface Props {
		text: string | null | undefined;
		size?: number;
	}

	let { text, size = 16 }: Props = $props();
	const segments = $derived(segmentAppleEmojis(text ?? ''));
</script>

{#each segments as seg, i (i)}
	{#if seg.type === 'emoji'}
		<img class="apple-emoji" src={seg.url} alt={seg.native} style="width: {size}px; height: {size}px;" draggable="false" />
	{:else}
		{seg.value}
	{/if}
{/each}

<style>
	.apple-emoji {
		display: inline-block;
		vertical-align: -0.2em;
		user-select: none;
		-webkit-user-drag: none;
	}
</style>
