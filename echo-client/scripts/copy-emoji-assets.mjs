import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'node_modules', 'emoji-datasource-apple', 'img', 'apple');
const staticRoot = join(here, '..', 'static', 'emojis', 'apple');

if (!existsSync(root)) {
	console.warn(`[emoji-assets] source not found: ${root} — skipping`);
	process.exit(0);
}

// 1) Individual PNGs (fallback / getImageURL)
const srcDir = join(root, '64');
const dstDir = join(staticRoot, '64');
mkdirSync(dstDir, { recursive: true });
const existing = existsSync(dstDir) ? readdirSync(dstDir).length : 0;
const expected = readdirSync(srcDir).length;
if (existing !== expected) {
	cpSync(srcDir, dstDir, { recursive: true, force: true });
	console.log(`[emoji-assets] copied ${expected} files → static/emojis/apple/64/`);
}

// 2) Spritesheet (what emoji-mart Picker actually uses)
const sheetsSrc = join(root, 'sheets-256', '64.png');
const sheetsDstDir = join(staticRoot, 'sheets');
const sheetsDst = join(sheetsDstDir, '64.png');
mkdirSync(sheetsDstDir, { recursive: true });
const srcSize = statSync(sheetsSrc).size;
const dstSize = existsSync(sheetsDst) ? statSync(sheetsDst).size : -1;
if (srcSize !== dstSize) {
	copyFileSync(sheetsSrc, sheetsDst);
	console.log(`[emoji-assets] copied spritesheet → static/emojis/apple/sheets/64.png`);
}
