export interface Country {
	code: string;
	dial: string;
	name: string;
	mask: string;
}

export const countries: Country[] = [
	{ code: 'ru', dial: '+7', name: 'Russia', mask: '(###) ###-##-##' },
	{ code: 'us', dial: '+1', name: 'United States', mask: '(###) ###-####' },
	{ code: 'gb', dial: '+44', name: 'United Kingdom', mask: '#### ######' },
	{ code: 'de', dial: '+49', name: 'Germany', mask: '#### #######' },
	{ code: 'fr', dial: '+33', name: 'France', mask: '# ## ## ## ##' },
	{ code: 'it', dial: '+39', name: 'Italy', mask: '### ### ####' },
	{ code: 'es', dial: '+34', name: 'Spain', mask: '### ### ###' },
	{ code: 'ua', dial: '+380', name: 'Ukraine', mask: '(##) ###-##-##' },
	{ code: 'by', dial: '+375', name: 'Belarus', mask: '(##) ###-##-##' },
	{ code: 'kz', dial: '+7', name: 'Kazakhstan', mask: '(###) ###-##-##' },
	{ code: 'pl', dial: '+48', name: 'Poland', mask: '### ### ###' },
	{ code: 'tr', dial: '+90', name: 'Turkey', mask: '(###) ###-##-##' },
	{ code: 'br', dial: '+55', name: 'Brazil', mask: '(##) #####-####' },
	{ code: 'in', dial: '+91', name: 'India', mask: '#####-#####' },
	{ code: 'cn', dial: '+86', name: 'China', mask: '### #### ####' },
	{ code: 'jp', dial: '+81', name: 'Japan', mask: '##-####-####' },
	{ code: 'kr', dial: '+82', name: 'South Korea', mask: '##-####-####' },
	{ code: 'au', dial: '+61', name: 'Australia', mask: '#### ### ###' },
	{ code: 'ca', dial: '+1', name: 'Canada', mask: '(###) ###-####' },
	{ code: 'mx', dial: '+52', name: 'Mexico', mask: '## #### ####' },
	{ code: 'ar', dial: '+54', name: 'Argentina', mask: '## ####-####' },
	{ code: 'eg', dial: '+20', name: 'Egypt', mask: '### ### ####' },
	{ code: 'ng', dial: '+234', name: 'Nigeria', mask: '### ### ####' },
	{ code: 'za', dial: '+27', name: 'South Africa', mask: '## ### ####' },
	{ code: 'ae', dial: '+971', name: 'UAE', mask: '## ### ####' },
	{ code: 'sa', dial: '+966', name: 'Saudi Arabia', mask: '## ### ####' },
	{ code: 'il', dial: '+972', name: 'Israel', mask: '##-###-####' },
	{ code: 'th', dial: '+66', name: 'Thailand', mask: '## ### ####' },
	{ code: 'vn', dial: '+84', name: 'Vietnam', mask: '## ### ## ##' },
	{ code: 'id', dial: '+62', name: 'Indonesia', mask: '###-###-####' },
	{ code: 'ge', dial: '+995', name: 'Georgia', mask: '### ## ## ##' },
	{ code: 'am', dial: '+374', name: 'Armenia', mask: '## ######' },
	{ code: 'az', dial: '+994', name: 'Azerbaijan', mask: '## ### ## ##' },
	{ code: 'uz', dial: '+998', name: 'Uzbekistan', mask: '## ### ## ##' },
];

// Longest dial code first, so +998 wins over +9 etc.
const byDialLength = [...countries].sort((a, b) => b.dial.length - a.dial.length);

export function applyMask(digits: string, mask: string): string {
	let result = '';
	let di = 0;
	for (let i = 0; i < mask.length && di < digits.length; i++) {
		if (mask[i] === '#') {
			result += digits[di++];
		} else {
			result += mask[i];
		}
	}
	return result;
}

export function maxDigits(mask: string): number {
	return mask.split('').filter((c) => c === '#').length;
}

// "+79232263686" -> "+7 (923) 226-36-86". Unknown dial codes come back as-is.
export function formatPhone(raw: string): string {
	if (!raw) return '';
	for (const c of byDialLength) {
		if (raw.startsWith(c.dial)) {
			const digits = raw.slice(c.dial.length).replace(/\D/g, '');
			return `${c.dial} ${applyMask(digits, c.mask)}`;
		}
	}
	return raw;
}

/**
 * Splits a stored E.164 number into the country it belongs to and the masked
 * local part the field shows. Falls back to the first country with the digits
 * left bare — an unknown dial code is still worth showing.
 */
export function splitPhone(raw: string): { country: Country; local: string } {
	if (!raw) return { country: countries[0], local: '' };
	for (const c of byDialLength) {
		if (raw.startsWith(c.dial)) {
			return { country: c, local: applyMask(raw.slice(c.dial.length).replace(/\D/g, ''), c.mask) };
		}
	}
	return { country: countries[0], local: raw.replace(/\D/g, '') };
}

/**
 * Where the caret belongs once the mask has been applied, given how many digits
 * stood before it in what the user typed.
 *
 * Counting digits rather than characters is the point: separators shift as the
 * mask reflows, digits don't, so "after the 4th digit" survives a `(999` turning
 * into `(999) `.
 */
export function caretAfterDigits(masked: string, digits: number): number {
	if (digits <= 0) return 0;

	let seen = 0;
	for (let i = 0; i < masked.length; i++) {
		if (!/\D/.test(masked[i])) {
			seen++;
			if (seen === digits) return i + 1;
		}
	}
	return masked.length;
}

/**
 * Backspace when the caret sits just after a separator the mask inserted — a
 * bracket or a dash. The browser would delete the separator, which the mask
 * puts straight back, so the key would appear to do nothing; what the user
 * means is "delete the digit before it".
 *
 * Returns the new local value and where the caret should land, or `null` when
 * this isn't that case and the browser should handle the key itself.
 */
export function deleteDigitBeforeSeparator(
	value: string,
	mask: string,
	caret: number,
): { local: string; caret: number } | null {
	const charBefore = value[caret - 1];
	if (!charBefore || !/\D/.test(charBefore)) return null;

	// How many digits the mask has placed before the caret; the last of them is
	// the one to drop.
	const digitIndex = mask.slice(0, caret).split('').filter((c) => c === '#').length - 1;
	if (digitIndex < 0) return null;

	const digits = value.replace(/\D/g, '');
	const local = applyMask(digits.slice(0, digitIndex) + digits.slice(digitIndex + 1), mask);

	// Step back over the separator(s) so the caret ends up right after a digit.
	let pos = caret - 1;
	while (pos > 0 && /\D/.test(mask[pos - 1] ?? '')) pos--;

	return { local, caret: pos };
}

/** Does a country match the picker's query — by either name, or by dial code. */
export function matchesCountryQuery(
	country: Country,
	localizedName: string,
	query: string,
): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	return (
		country.name.toLowerCase().includes(q)
		|| localizedName.toLowerCase().includes(q)
		|| country.dial.includes(q)
	);
}
