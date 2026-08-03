import { en, type Dict } from './en.js';
import { ru } from './ru.js';

export type Locale = 'en' | 'ru';

export const LOCALES: { code: Locale; label: string; flag: string }[] = [
	// `label` is deliberately the endonym — a language picker should be
	// readable to someone who can't read the language it's currently in.
	{ code: 'en', label: 'English', flag: 'gb' },
	{ code: 'ru', label: 'Русский', flag: 'ru' },
];

const DICTS: Record<Locale, Dict> = { en, ru };

const KEY = 'echo:locale';

function isLocale(v: unknown): v is Locale {
	return v === 'en' || v === 'ru';
}

function read(): Locale {
	try {
		const stored = localStorage.getItem(KEY);
		if (isLocale(stored)) return stored;
		// No explicit choice yet — follow the browser/OS language once, then
		// remember whatever the user picks from then on.
		const nav = navigator.language?.slice(0, 2).toLowerCase();
		if (isLocale(nav)) return nav;
	} catch {
		// ignore (private mode, no localStorage, SSR)
	}
	return 'en';
}

let current = $state<Locale>(read());

function applyToDocument(locale: Locale) {
	try {
		document.documentElement.lang = locale;
	} catch {
		// ignore (no document)
	}
}

applyToDocument(current);

export const i18n = {
	get locale(): Locale {
		return current;
	},
	/** Current dictionary. Reading it in a component tracks locale changes. */
	get t(): Dict {
		return DICTS[current];
	},
	setLocale(locale: Locale) {
		if (!isLocale(locale) || locale === current) return;
		current = locale;
		applyToDocument(locale);
		try {
			localStorage.setItem(KEY, locale);
		} catch {
			// ignore (private mode, quota, etc.)
		}
	},
};
