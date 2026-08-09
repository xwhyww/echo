import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Set by `tauri ios dev --host <ip>`: the address the phone will load the app
// from. Absent for the browser and for desktop dev, where localhost is right.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		// Listen on every interface so the dev build is reachable from a phone on
		// the same wifi (http://<this-machine-ip>:5173), not just localhost.
		host: host || true,
		port: 5173,
		// Fail rather than silently moving to 5174 — the device was told which
		// port to load from before the server started, and a shifted port shows up
		// as an app that simply never connects.
		strictPort: true,
		// HMR needs its own websocket, and on a device it must be told where to
		// dial. Left to itself the client infers a host that the phone cannot
		// reach, so the socket never opens: the page loads over the network fine,
		// updates are sent to nobody, and edits appear only when the app is
		// relaunched and re-fetches everything.
		hmr: host ? { protocol: 'ws', host, port: 5174 } : undefined,
		watch: {
			// Rust and Swift are compiled into the binary; a change there needs a
			// rebuild, not a page reload. Watching them only causes churn.
			ignored: ['**/src-tauri/**'],
		},
	},
});
