<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronDown, ChevronRight, Plus, Pencil, Trash2 } from 'lucide-svelte';
	import DropdownMenu from '$lib/components/ui/DropdownMenu.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// A collapsible group of voice channels. The channels themselves are passed
	// in as a snippet, so this owns only the header and the empty state.
	interface Props {
		name: string;
		count: number;
		open: boolean;
		canManage: boolean;
		menuOpen: boolean;
		ontoggle: () => void;
		onmenutoggle: () => void;
		onmenuclose: () => void;
		onaddchannel: () => void;
		onrename: () => void;
		ondelete: () => void;
		children: Snippet;
	}

	let {
		name,
		count,
		open,
		canManage,
		menuOpen,
		ontoggle,
		onmenutoggle,
		onmenuclose,
		onaddchannel,
		onrename,
		ondelete,
		children,
	}: Props = $props();
</script>

<section class="vp-cat">
	<header class="vp-cat-head">
		<button class="vp-cat-toggle body-xs overline fw-semibold text-muted" onclick={ontoggle} aria-expanded={open}>
			{#if open}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
			<span class="vp-cat-name">{name}</span>
			<span class="vp-cat-count body-xxs text-faint">{count}</span>
		</button>
		{#if canManage}
			<DropdownMenu
				open={menuOpen}
				ontoggle={onmenutoggle}
				onclose={onmenuclose}
				label={t.voice.categoryOptions}
			>
				<button onclick={onaddchannel}><Plus size={14} /> {t.voice.newChannelHere}</button>
				<button onclick={onrename}><Pencil size={14} /> {t.voice.rename}</button>
				<button class="danger" onclick={ondelete}>
					<Trash2 size={14} /> {t.voice.deleteCategory}
				</button>
			</DropdownMenu>
		{/if}
	</header>

	{#if open}
		{#if count === 0}
			<p class="vp-cat-empty body-xs text-faint">{t.voice.noChannelsInCategory}</p>
		{:else}
			<ul class="vp-list">{@render children()}</ul>
		{/if}
	{/if}
</section>

<style>
	.vp-cat {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.vp-cat-head {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		padding: 0 var(--sp-1);
	}

	.vp-cat-toggle {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-1) var(--sp-2);
		background: none;
		border: none;
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: color var(--duration-fast) var(--ease-default);
	}

	.vp-cat-name {
		flex: 1;
		text-align: left;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vp-cat-count {
		padding: 1px 6px;
		border-radius: var(--radius-full);
		background: var(--c-bg-3);
		letter-spacing: 0;
		text-transform: none;
	}

	.vp-cat-empty {
		padding: var(--sp-2) var(--sp-3);
		margin: 0;
	}

	.vp-cat-head :global(.menu-btn) {
		width: 28px;
		height: 28px;
	}

	.vp-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
</style>
