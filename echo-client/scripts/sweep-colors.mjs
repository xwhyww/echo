// Moves static `color: var(--c-*)` out of a component's scoped CSS and into the
// markup as a utility class. Only touches rules whose selector is a single
// class used on plain elements — anything compound, stateful, or on an element
// selector is reported and left alone for a human.
import { readFileSync, writeFileSync } from 'node:fs';

const STATEFUL =
	/:hover|:focus|:active|:disabled|::|:not|@media|:global|\.\w[\w-]*\.\w/;

const CLASS_FOR = {
	'--c-text': 'text-default',
	'--c-text-muted': 'text-muted',
	'--c-text-faint': 'text-faint',
	'--c-accent-text': 'text-accent',
	'--c-accent': 'text-accent-solid',
	'--c-error': 'text-error',
	'--c-success': 'text-success',
	'--c-text-inverse': 'text-inverse',
};

const files = process.argv.slice(2).filter((a) => a !== '--apply');
const apply = process.argv.includes('--apply');

let totalMoved = 0;
const skipped = [];

for (const file of files) {
	let s = readFileSync(file, 'utf8');
	const styleStart = s.indexOf('<style');
	if (styleStart < 0) continue;

	let markup = s.slice(0, styleStart);
	let css = s.slice(styleStart);
	const moved = [];

	css = css.replace(/([^{}]+)\{([^{}]*)\}/g, (whole, sel, body) => {
		const selector = sel.trim().split(/\r?\n/).pop().trim();
		if (STATEFUL.test(sel)) return whole;
		// A single class, nothing else.
		if (!/^\.[\w-]+$/.test(selector)) return whole;
		const cls = selector.slice(1);

		let token = null;
		const nextBody = body.replace(
			/^[ \t]*color:\s*var\((--c-[a-z0-9-]+)[^)]*\);[ \t]*\r?\n?/gm,
			(line, tok) => {
				if (!CLASS_FOR[tok]) return line;
				token = tok;
				return '';
			},
		);
		if (!token) return whole;

		// Every element carrying this class must be reachable in the markup.
		const attrRe = new RegExp(`class="([^"]*\\b${cls}\\b[^"]*)"`, 'g');
		if (!attrRe.test(markup)) {
			skipped.push(`${file}: .${cls} (not a literal class attribute)`);
			return whole;
		}
		const util = CLASS_FOR[token];
		markup = markup.replace(
			new RegExp(`class="([^"]*\\b${cls}\\b[^"]*)"`, 'g'),
			(m, list) => (list.split(/\s+/).includes(util) ? m : `class="${list} ${util}"`),
		);
		moved.push(`.${cls} -> ${util}`);
		if (!/[a-z-]+\s*:/i.test(nextBody)) return '';
		return sel + '{' + nextBody + '}';
	});

	if (moved.length === 0) continue;
	totalMoved += moved.length;
	console.log(`${file.split(/[\\/]/).pop()}: ${moved.join(', ')}`);
	if (apply) {
		css = css.replace(/\r?\n[ \t]*\r?\n[ \t]*\r?\n/g, '\n\n');
		writeFileSync(file, markup + css);
	}
}

console.log(`\n${apply ? 'moved' : 'movable'}: ${totalMoved}`);
if (skipped.length) console.log('left alone:\n  ' + skipped.join('\n  '));
