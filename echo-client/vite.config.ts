import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		// Listen on every interface so the dev build is reachable from a phone on
		// the same wifi (http://<this-machine-ip>:5173), not just localhost.
		host: true
	}
});
