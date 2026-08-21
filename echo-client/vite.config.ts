import { sveltekit } from '@sveltejs/kit/vite';
// From vitest rather than vite: the `test` block below is vitest's, and vite's
// own `defineConfig` does not know about it. Same function for everything else.
import { defineConfig } from 'vitest/config';

// Set by `tauri ios dev --host <ip>`: the address the phone will load the app
// from. Absent for the browser and for desktop dev, where localhost is right.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		// Listen on every interface so the dev build is reachable from a phone on
		// the same wifi (http://<this-machine-ip>:5173), not just localhost.
		//
		// Every interface, deliberately, even when TAURI_DEV_HOST names one. Bound
		// to that address alone the server answers on nothing else — and the
		// address is not always one the device can route to. The Tauri CLI picks
		// it by enumerating this machine's interfaces, which on a laptop running a
		// VPN means the tunnel's address as often as the wifi's; an Android
		// emulator reaching the host through 10.0.2.2 then finds nothing
		// listening, and the app comes up as a black screen with no error. Nothing
		// is lost by listening more widely: the variable still decides the URL the
		// device is *told* to load, which is the part that has to be right.
		host: true,
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
	test: {
		// Only the pure helpers in utils/ — no runes, no I/O, no reactivity, which
		// is exactly what CLAUDE.md says belongs there and what makes them worth
		// testing. Component tests would need a DOM environment and a Svelte
		// plugin for the test transform; that is a separate decision.
		include: ['src/lib/utils/**/*.test.ts'],
	},
});
