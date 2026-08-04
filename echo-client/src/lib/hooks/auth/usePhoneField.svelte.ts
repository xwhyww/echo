import {
	applyMask,
	caretAfterDigits,
	deleteDigitBeforeSeparator,
	maxDigits,
	splitPhone,
	type Country,
} from '$lib/utils/phone.js';

/**
 * A phone field's two halves: which country is selected and the masked local
 * number, kept in step with the E.164 string the form actually stores.
 *
 * The caret work is the reason this isn't just a `$derived`: rewriting the value
 * on every keystroke moves the cursor to the end, so it has to be put back where
 * the typing left it.
 *
 * Both the value and the caret are written straight to the element rather than
 * left to Svelte. Assigning `local` only schedules a DOM update, so anything
 * that reads or sets `input.value` in the same handler is still looking at what
 * the user typed — and when the mask changes nothing (a digit past the mask's
 * capacity), `local` never changes, no update is scheduled at all, and the
 * surplus character would simply stay on screen.
 */
export function usePhoneField(options: {
	/** Read once, at creation: the field owns the value from then on. */
	initial: string;
	onchange: (e164: string) => void;
	input: () => HTMLInputElement | null;
}) {
	const start = splitPhone(options.initial);
	let country = $state<Country>(start.country);
	let local = $state(start.local);

	function publish() {
		const digits = local.replace(/\D/g, '');
		options.onchange(digits ? `${country.dial}${digits}` : '');
	}

	/**
	 * Push a masked value into the element and put the caret at `caret`.
	 * Svelte's own update lands on an identical string afterwards, which browsers
	 * treat as a no-op and leave the selection alone.
	 */
	function render(input: HTMLInputElement, masked: string, caret: number) {
		local = masked;
		publish();
		input.value = masked;
		input.setSelectionRange(caret, caret);
	}

	return {
		get country() { return country; },
		get local() { return local; },
		/** The mask with every slot shown as a zero — "(000) 000-00-00". */
		get placeholder() { return country.mask.replace(/#/g, '0'); },

		selectCountry(next: Country) {
			country = next;
			// Keep as many digits as the new mask has room for.
			local = applyMask(local.replace(/\D/g, '').slice(0, maxDigits(next.mask)), next.mask);
			publish();
			requestAnimationFrame(() => options.input()?.focus());
		},

		onInput(e: Event) {
			const input = e.target as HTMLInputElement;
			const typed = input.value;
			const caret = input.selectionStart ?? typed.length;

			// Anchor the caret to a digit count, not a character offset: the mask
			// adds and removes separators around it, so "after the 4th digit" is
			// the only description that survives the rewrite.
			const digitsBefore = typed.slice(0, caret).replace(/\D/g, '').length;

			const digits = typed.replace(/\D/g, '').slice(0, maxDigits(country.mask));
			const masked = applyMask(digits, country.mask);

			render(input, masked, caretAfterDigits(masked, digitsBefore));
		},

		onKeydown(e: KeyboardEvent) {
			if (e.key !== 'Backspace') return;
			const input = e.target as HTMLInputElement;
			// A selection is a plain delete; only a bare caret needs the special case.
			if (input.selectionStart !== input.selectionEnd) return;

			const caret = input.selectionStart ?? 0;
			const result = deleteDigitBeforeSeparator(input.value, country.mask, caret);
			if (!result) return;

			e.preventDefault();
			render(input, result.local, result.caret);
		},
	};
}
