<script lang="ts">
	import Input from '$lib/components/ui/Input.svelte';
	import { Search } from 'lucide-svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	// Shared search box that sits at the top of every sidebar list (DMs,
	// Groups, All Chats). Each sidebar just binds its own `value`; the layout,
	// icon and spacing live here so the three lists stay visually identical.
	let {
		value = $bindable(''),
		placeholder,
	}: { value?: string; placeholder?: string } = $props();

	// Left undefined by callers that want the generic label — resolved here so
	// it follows the active locale instead of freezing at mount.
	const resolvedPlaceholder = $derived(placeholder ?? i18n.t.common.searchPlaceholder);
</script>

<div class="sidebar-search-header">
	<Input placeholder={resolvedPlaceholder} bind:value>
		{#snippet icon()}<Search size={14} />{/snippet}
	</Input>
</div>

<style>
	.sidebar-search-header {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
</style>
