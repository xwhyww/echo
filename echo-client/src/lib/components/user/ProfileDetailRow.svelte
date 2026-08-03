<script lang="ts">
	import type { Snippet } from 'svelte';
	import Copiable from '$lib/components/ui/Copiable.svelte';

	// One labelled, copy-on-click fact about a person: handle, email, phone.
	interface Props {
		label: string;
		/** What lands on the clipboard — often formatted differently to the display. */
		text: string;
		children: Snippet;
	}

	let { label, text, children }: Props = $props();
</script>

<div class="detail-section">
	<h2 class="body-sm text-faint fw-medium">{label}</h2>
	<Copiable {text}>{@render children()}</Copiable>
</div>

<style>
	.detail-section {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		padding: var(--sp-2) 0;
		border-top: 1px solid var(--c-border);
	}
</style>
