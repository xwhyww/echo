<script lang="ts">
	import { untrack } from 'svelte';
	import CountryPicker from '$lib/components/ui/CountryPicker.svelte';
	import { usePhoneField } from '$lib/hooks/auth/usePhoneField.svelte.js';

	// Dial code and local number as one control: the value bound out is E.164
	// ("+79232263686"), what the user types is masked per country.
	interface Props {
		value?: string;
		id?: string;
	}

	let { value = $bindable(''), id }: Props = $props();

	let inputEl: HTMLInputElement | undefined = $state();

	const phone = usePhoneField({
		// The field takes the value over from here on, so the snapshot is the
		// point — `untrack` says so rather than leaving a warning to explain it.
		initial: untrack(() => value),
		onchange: (e164) => (value = e164),
		input: () => inputEl ?? null,
	});
</script>

<div class="phone-input">
	<CountryPicker selected={phone.country} onselect={phone.selectCountry} />

	<input
		{id}
		class="number-input"
		type="tel"
		bind:this={inputEl}
		value={phone.local}
		placeholder={phone.placeholder}
		oninput={phone.onInput}
		onkeydown={phone.onKeydown}
	/>
</div>

<style>
	.phone-input {
		display: flex;
		gap: 0;
		width: 100%;
	}

	.number-input {
		flex: 1;
		min-width: 0;
		height: var(--input-h);
		padding: var(--sp-3) var(--sp-4);
		font: inherit;
		color: inherit;
		background: var(--c-bg-3);
		border: 2px solid var(--c-border);
		border-left: 1px solid var(--c-border);
		border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
		outline: none;
		transition: border-color var(--duration-fast) var(--ease-default);
	}

	.number-input:focus {
		border-color: var(--c-accent-hover);
	}

	.number-input::placeholder {
		color: var(--c-text-faint);
	}

	/* Keep the two halves' borders visually joined when either side is focused.
	   `:global` because the toggle belongs to CountryPicker. */
	.phone-input:focus-within :global(.country-toggle) {
		border-color: var(--c-accent-hover);
	}
</style>
