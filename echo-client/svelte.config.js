import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { relative, sep } from 'node:path';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		// defaults to rune mode for the project, execept for `node_modules`. Can be removed in svelte 6.
		runes: ({ filename }) => {
			const relativePath = relative(import.meta.dirname, filename);
			const pathSegments = relativePath.toLowerCase().split(sep);
			const isExternalLibrary = pathSegments.includes('node_modules');

			return isExternalLibrary ? undefined : true;
		}
	},
	kit: {
		// The app ships inside Tauri, which loads the built files off disk. It
		// always enters at index.html and routes client-side from there (`ssr` is
		// off), so a plain static build is enough — no fallback page needed.
		adapter: adapter(),
		prerender: {
			// `+layout.ts` marks everything prerenderable, but the dynamic routes
			// (/user/[id], /chats/perschat/[id], …) have no entries to crawl —
			// their ids only exist at runtime. The fallback shell serves them, so
			// not reaching them during the build is expected rather than an error.
			handleUnseenRoutes: 'ignore'
		}
	}
};

export default config;
