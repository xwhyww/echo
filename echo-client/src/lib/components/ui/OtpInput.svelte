<script lang="ts">
	import { untrack } from 'svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);
	interface Props {
		length?: number;
		value?: string;
		disabled?: boolean;
		id?: string;
		autofocus?: boolean;
		// Fires once when every cell is filled — the "auto continue".
		oncomplete?: (code: string) => void;
	}

	let { length = 6, value = $bindable(''), disabled = false, id, autofocus = false, oncomplete }: Props = $props();

	// Just the starting shape; the sync effect below re-cuts `cells` to `length`
	// if it ever changes, and `inputs` refills from the `{#each}` bindings.
	let cells = $state<string[]>(untrack(() => Array(length).fill('')));
	let inputs: (HTMLInputElement | null)[] = $state(untrack(() => Array(length).fill(null)));

	$effect(() => {
		if (autofocus) inputs[0]?.focus();
	});

	// Keep cells in sync when the owner resets/presets the bound value
	// (e.g. clearing the code on resend).
	$effect(() => {
		if (value !== cells.join('')) {
			const v = value.replace(/\D/g, '').slice(0, length);
			cells = Array.from({ length }, (_, i) => v[i] ?? '');
		}
	});

	function focusCell(i: number) {
		const el = inputs[Math.max(0, Math.min(i, length - 1))];
		el?.focus();
		el?.select();
	}

	function commit() {
		value = cells.join('');
		if (cells.every((c) => c !== '')) {
			oncomplete?.(value);
		}
	}

	function handleInput(i: number, e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const digits = el.value.replace(/\D/g, '');

		if (!digits) {
			cells[i] = '';
			el.value = '';
			commit();
			return;
		}

		// More than one digit lands here on paste or when typing over a
		// filled cell — spread them across the following cells.
		let idx = i;
		for (const ch of digits) {
			if (idx >= length) break;
			cells[idx] = ch;
			idx++;
		}
		el.value = cells[i];
		focusCell(idx);
		commit();
	}

	function handleKeydown(i: number, e: KeyboardEvent) {
		if (e.key === 'Backspace' && cells[i] === '' && i > 0) {
			e.preventDefault();
			cells[i - 1] = '';
			focusCell(i - 1);
			commit();
		} else if (e.key === 'ArrowLeft' && i > 0) {
			e.preventDefault();
			focusCell(i - 1);
		} else if (e.key === 'ArrowRight' && i < length - 1) {
			e.preventDefault();
			focusCell(i + 1);
		}
	}

	function handlePaste(e: ClipboardEvent) {
		e.preventDefault();
		const digits = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, length);
		if (!digits) return;
		cells = Array.from({ length }, (_, i) => digits[i] ?? '');
		focusCell(digits.length);
		commit();
	}
</script>

<div class="otp" role="group" aria-label={t.login.otpAria}>
	{#each cells as cell, i (i)}
		<input
			bind:this={inputs[i]}
			id={i === 0 ? id : undefined}
			class="cell heading-lg"
			class:filled={cell !== ''}
			type="text"
			value={cell}
			maxlength={2}
			inputmode="numeric"
			autocomplete={i === 0 ? 'one-time-code' : 'off'}
			aria-label={`Digit ${i + 1}`}
			{disabled}
			oninput={(e) => handleInput(i, e)}
			onkeydown={(e) => handleKeydown(i, e)}
			onpaste={handlePaste}
			onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
		/>
	{/each}
</div>

<style>
	.otp {
		display: flex;
		gap: var(--sp-2);
		justify-content: space-between;
	}

	.cell {
		/* Fluid cells: the flex row divides the width, aspect-ratio keeps
		   each cell square at whatever size that yields. */
		width: 100%;
		height: auto;
		aspect-ratio: 1;
		min-height: 30px;
		text-align: center;
		color: inherit;
		background: var(--c-bg-3);
		border: 2px solid var(--c-border);
		border-radius: var(--radius-md);
		outline: none;
		padding: 0;
		caret-color: var(--c-accent-hover);
		transition: border-color var(--duration-fast) var(--ease-default);

		@media (min-width: 375px) {
			width: 100%;
			border-radius: var(--radius-lg);
		}

		@media (min-width: 480px) {
			width: 48px;
			height: 56px;
			aspect-ratio: auto;
			min-width: 48px;
			min-height: 56px;
		}
	}

	.cell:focus {
		border-color: var(--c-accent-hover);
	}

	.cell.filled {
		border-color: var(--c-border-strong, var(--c-border));
	}

	.cell:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
