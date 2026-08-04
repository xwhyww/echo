// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

interface ImportMetaEnv {
	// Which machine runs echo-server. Only needed where the app can't work it
	// out from the URL it was served over — i.e. a bundled iOS/Android build.
	// See src/lib/api/client.ts.
	readonly VITE_API_HOST?: string;
}

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
