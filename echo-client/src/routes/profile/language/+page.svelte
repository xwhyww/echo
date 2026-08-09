<script lang="ts">
	import { Check } from 'lucide-svelte';
	import SettingsBlock from '$lib/components/settings/SettingsBlock.svelte';
	import PageColumn from '$lib/components/layouts/PageColumn.svelte';
	import { i18n, LOCALES } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);
</script>

<PageColumn maxWidth="560px" gap="var(--sp-1)">
	<p class="body-sm text-faint">{t.language.subtitle}</p>

	<SettingsBlock title={t.language.interfaceLabel} desc={t.language.interfaceDesc}>
		<div class="options" role="radiogroup" aria-label={t.language.interfaceLabel}>
			{#each LOCALES as loc (loc.code)}
				{@const active = i18n.locale === loc.code}
				<button
					type="button"
					class="option"
					class:active
					class:text-accent={active}
					class:text-default={!active}
					role="radio"
					aria-checked={active}
					onclick={() => i18n.setLocale(loc.code)}
				>
					<img class="flag" src="/flags/{loc.flag}.svg" alt="" />
					<span class="names">
						<span class="native body-sm fw-medium">{loc.label}</span>
						<span class="translated body-xs text-faint">{t.language.names[loc.code]}</span>
					</span>
					{#if active}
						<Check size={18} />
					{/if}
				</button>
			{/each}
		</div>
	</SettingsBlock>
</PageColumn>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	p {
		margin: 0;
	}

	.options {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.option {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		width: 100%;
		padding: var(--sp-3);
		background: var(--c-bg-2);
		border: 1px solid var(--c-border);
		border-radius: var(--radius-md);
		text-align: left;
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-default),
			border-color var(--duration-fast) var(--ease-default);

		@include glass;
	}

	.option.active {
		background: var(--c-accent-subtle);
		border-color: var(--c-accent-solid);
	}

	.flag {
		width: 24px;
		height: 18px;
		flex-shrink: 0;
		border-radius: 2px;
		object-fit: cover;
	}

	.names {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}
</style>
