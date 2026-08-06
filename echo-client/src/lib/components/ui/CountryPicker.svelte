<script lang="ts">
	import { ChevronDown } from 'lucide-svelte';
	import { countries, matchesCountryQuery, type Country } from '$lib/utils/phone.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// The dial-code half of a phone field: a flag, the code, and a searchable
	// list of every country under it.
	interface Props {
		selected: Country;
		onselect: (country: Country) => void;
	}

	let { selected, onselect }: Props = $props();

	let open = $state(false);
	let root: HTMLDivElement | undefined = $state();
	let query = $state('');

	// The list ships English names; the dictionary supplies localized ones and
	// falls back to the shipped name for any country it doesn't cover. Search
	// matches both, so typing "Россия" or "Russia" finds the same row.
	const name = (c: Country) => t.countries[c.code] ?? c.name;

	const filtered = $derived(countries.filter((c) => matchesCountryQuery(c, name(c), query)));

	function toggle() {
		open = !open;
		query = '';
	}

	function choose(country: Country) {
		open = false;
		query = '';
		onselect(country);
	}

	function onDocumentClick(e: MouseEvent) {
		if (root && !root.contains(e.target as Node)) {
			open = false;
			query = '';
		}
	}
</script>

<svelte:document onclick={onDocumentClick} />

<div class="country-selector" bind:this={root}>
	<button type="button" class="country-toggle body-sm text-default" onclick={toggle}>
		<img class="flag" src="/flags/{selected.code}.svg" alt={name(selected)} />
		<span class="dial-code body-sm fw-bold text-muted">{selected.dial}</span>
		<span class="chevron text-faint" class:open><ChevronDown size={16} /></span>
	</button>

	{#if open}
		<div class="dropdown">
			<input
				class="dropdown-search body-sm text-default"
				type="text"
				placeholder={t.common.searchPlaceholder}
				bind:value={query}
				onclick={(e) => e.stopPropagation()}
			/>
			<div class="dropdown-list">
				{#each filtered as country (country.code)}
					<button
						type="button"
						class="dropdown-item body-sm text-default"
						class:active={country.code === selected.code}
						onclick={() => choose(country)}
					>
						<img class="flag" src="/flags/{country.code}.svg" alt={name(country)} />
						<span class="country-name">{name(country)}</span>
						<span class="country-dial text-faint">{country.dial}</span>
					</button>
				{/each}
				{#if filtered.length === 0}
					<div class="dropdown-empty body-sm text-faint">{t.common.noResults}</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.country-selector {
		position: relative;
		flex-shrink: 0;
	}

	.country-toggle {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		height: var(--input-h);
		padding: 0 var(--sp-3);
		background: var(--c-bg-3);
		border: 2px solid var(--c-border);
		border-right: 1px solid var(--c-border);
		border-radius: var(--radius-lg) 0 0 var(--radius-lg);
		cursor: pointer;
		transition: border-color var(--duration-fast) var(--ease-default);
		white-space: nowrap;
	}

	.country-toggle:focus-visible {
		border-color: var(--c-accent-hover);
		outline: none;
	}

	.flag {
		width: 24px;
		height: 18px;
		flex-shrink: 0;
		border-radius: 2px;
		object-fit: cover;
	}

	.dial-code {
		margin-left: 4px;
	}

	.chevron {
		transition: transform var(--duration-slow) var(--ease-default);
		min-width: 20px;
		min-height: 20px;
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.chevron.open {
		transform: rotate(180deg);
	}

	.dropdown {
		position: absolute;
		top: calc(100% + var(--sp-1));
		left: 0;
		width: 280px;
		max-height: 300px;
		display: flex;
		flex-direction: column;
		background: var(--c-surface);
		border: 1px solid var(--c-border-strong);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		z-index: var(--z-dropdown);
		overflow: hidden;
	}

	.dropdown-search {
		width: 100%;
		padding: var(--sp-3);
		background: var(--c-bg-3);
		border: none;
		border-bottom: 1px solid var(--c-border);
		outline: none;
	}

	.dropdown-search::placeholder {
		color: var(--c-text-faint);
	}

	.dropdown-list {
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		width: 100%;
		padding: var(--sp-2) var(--sp-3);
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: background var(--duration-fast) var(--ease-default);
	}

	.dropdown-item.active {
		background: var(--c-accent-subtle);
	}

	.country-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.country-dial {
		flex-shrink: 0;
	}

	.dropdown-empty {
		padding: var(--sp-4);
		text-align: center;
	}
</style>
