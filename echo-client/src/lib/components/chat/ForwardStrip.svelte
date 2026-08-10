<script lang="ts">
	import type { ForwardedFrom } from '$lib/api/personalChats.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		forwardedFrom: ForwardedFrom;
		onuserclick?: (userId: string) => void;
	}

	let { forwardedFrom, onuserclick }: Props = $props();
</script>

<div class="forward-strip body-xs">
	<span class="forward-label">{t.chat.forwardedFrom}</span>
	<button
		class="forward-author fw-semibold text-accent"
		onclick={(e) => { e.stopPropagation(); onuserclick?.(forwardedFrom.authorId); }}
	>{forwardedFrom.authorName}</button>
</div>

<style>
	.forward-strip {
		display: flex;
		align-items: baseline;
		gap: var(--sp-1);
	}

	.forward-label {
		color: white;
	}
</style>
