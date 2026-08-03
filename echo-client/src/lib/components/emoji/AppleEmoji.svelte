<script lang="ts">
	import { getAppleEmojiUrl } from '$lib/utils/appleEmoji';

	interface Props {
		emoji: string;
		size?: number;
	}

	let { emoji, size = 18 }: Props = $props();
	const url = $derived(getAppleEmojiUrl(emoji));
</script>

{#if url}
	<img class="apple-emoji" src={url} alt={emoji} style="width: {size}px; height: {size}px;" draggable="false" />
{:else}
	<span class="apple-emoji-fallback" style="font-size: {size}px; line-height: {size}px;">{emoji}</span>
{/if}

<style>
	.apple-emoji {
		display: inline-block;
		vertical-align: middle;
		user-select: none;
		-webkit-user-drag: none;
	}
	.apple-emoji-fallback {
		display: inline-block;
		vertical-align: middle;
	}
</style>
