<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowLeft } from 'lucide-svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		// Fallback destination: landing on the page directly (deep link,
		// reload) leaves no history to go back to.
		backHref: string;
		size?: number;
	}

	let { backHref, size = 32 }: Props = $props();

	function goBack() {
		if (history.length > 1) {
			history.back();
		} else {
			goto(backHref);
		}
	}
</script>

<button class="back-btn text-muted" style="--back-size: {size}px" onclick={goBack} aria-label={t.common.back}>
	<ArrowLeft size={22} />
</button>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.back-btn {
		width: var(--back-size);
		height: var(--back-size);
		flex-shrink: 0;
		border-radius: var(--radius-full);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		@include glass;
	}

	.back-btn:hover {
		background: var(--glass-bg-hover);
		color: var(--c-text);
	}
</style>
