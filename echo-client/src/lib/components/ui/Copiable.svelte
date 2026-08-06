<script lang="ts">
	import { Copy, Check } from 'lucide-svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	let { text, children }: { text: string; children: any } = $props();

	let copied = $state(false);
	let timeout: ReturnType<typeof setTimeout>;

	function copy() {
		navigator.clipboard.writeText(text);
		copied = true;
		clearTimeout(timeout);
		timeout = setTimeout(() => (copied = false), 1500);
	}
</script>

<button class="copiable text-default" onclick={copy} title={t.common.copy}>
	<span class="content">{@render children()}</span>
	<span class="icon text-muted" class:copied>
		{#if copied}
			<Check size={16} />
		{:else}
			<Copy size={16} />
		{/if}
	</span>
</button>

<style>
	.copiable {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		cursor: pointer;
		transition: color var(--duration-fast) var(--ease-default);
	}

	.icon {
		display: inline-flex;
		transition: color var(--duration-fast) var(--ease-default);
	}

	.icon.copied {
		color: var(--c-online);
	}
</style>
