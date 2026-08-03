<script lang="ts">
	import AppleEmoji from '$lib/components/emoji/AppleEmoji.svelte';
	import { splitSegments } from '$lib/utils/messageSegments.js';

	interface Props {
		content: string;
		/** Renders emoji at display size — set when the message is nothing but emoji. */
		emojiOnly?: boolean;
		own?: boolean;
		onmention?: (username: string) => void;
		oncontextmenu?: (e: MouseEvent) => void;
	}

	let { content, emojiOnly = false, own = false, onmention, oncontextmenu }: Props = $props();

	const segments = $derived(splitSegments(content));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  class="bubble-text body-xs"
  class:own
  {oncontextmenu}
>
  {#each segments as seg}
    {#if seg.kind === 'emoji'}
      <AppleEmoji
        emoji={seg.text}
        size={emojiOnly ? 28 : 14}
      />
    {:else if seg.kind === 'link'}
      <a
        href={seg.text}
        class="bubble-link"
        target="_blank"
        rel="noopener noreferrer"
        onclick={(e) => e.stopPropagation()}>
        {seg.text}
      </a>
    {:else if seg.kind === 'mention'}
      <button
        class="bubble-mention fw-medium"
        onclick={(e) => { e.stopPropagation(); onmention?.(seg.text.slice(1)); }}
      >
        {seg.text}
      </button>
    {:else}
      {seg.text}
    {/if}
  {/each}
</span>

<style>
	.bubble-text {
		display: block;
		width: 100%;
	}

	.bubble-link {
		color: #7cacf8;
		text-decoration: underline;
		text-decoration-color: transparent;
		transition: text-decoration-color var(--duration-fast) var(--ease-default);
		word-break: break-all;
	}

	.bubble-link:hover {
		text-decoration-color: #7cacf8;
	}

	.bubble-text.own .bubble-link {
		color: #a8d4ff;
	}

	.bubble-text.own .bubble-link:hover {
		text-decoration-color: #a8d4ff;
	}

	.bubble-mention {
		color: #7cacf8;
		cursor: pointer;
		display: inline;
		font-size: inherit;
		line-height: inherit;
		padding: 0;
		text-decoration: underline;
		text-decoration-color: transparent;
		transition: text-decoration-color var(--duration-fast) var(--ease-default);
	}

	.bubble-mention:hover {
		text-decoration-color: #7cacf8;
	}

	.bubble-text.own .bubble-mention {
		color: #a8d4ff;
	}

	.bubble-text.own .bubble-mention:hover {
		text-decoration-color: #a8d4ff;
	}
</style>
