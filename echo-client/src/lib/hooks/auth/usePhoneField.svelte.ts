import {
	applyMask,
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
 * the typing left it — after the browser has painted, hence the rAF.
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

	function restoreCaret(pos: number) {
		requestAnimationFrame(() => options.input()?.setSelectionRange(pos, pos));
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
			const caret = input.selectionStart ?? 0;
			const lengthBefore = input.value.length;

			local = applyMask(
				input.value.replace(/\D/g, '').slice(0, maxDigits(country.mask)),
				country.mask,
			);
			publish();

			// The mask may have inserted or dropped separators around the caret;
			// shift it by however much the string grew or shrank.
			restoreCaret(Math.max(0, caret + (input.value.length - lengthBefore)));
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
			local = result.local;
			publish();
			restoreCaret(result.caret);
		},
	};
}
