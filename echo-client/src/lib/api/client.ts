export const isTauri =
	typeof window !== 'undefined' &&
	('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

// Hosts that tell us nothing about where the backend lives. `tauri.localhost`
// is the origin a bundled Tauri webview serves from; `localhost` on a phone is
// the phone itself, never the dev machine.
const OPAQUE_HOSTS = new Set(['tauri.localhost', 'localhost', '127.0.0.1', '']);

// Which machine to talk to, in order of confidence:
//
//  1. VITE_API_HOST, when the build was told explicitly. A bundled iOS app has
//     no other way to know — it ships its frontend on disk, so nothing in
//     `location` points at the dev machine.
//  2. The host that served this page. Covers the browser and `tauri ios dev`
//     alike: both load off http://<mac-ip>:5173, so the API and WS follow to
//     the same IP instead of the device's own loopback.
//  3. localhost — desktop Tauri, where the backend really is on this machine.
const CONFIGURED_HOST = import.meta.env.VITE_API_HOST?.trim();
const SERVING_HOST = typeof location !== 'undefined' ? location.hostname : '';

export const API_HOST =
	CONFIGURED_HOST || (OPAQUE_HOSTS.has(SERVING_HOST) ? 'localhost' : SERVING_HOST);

// A deployment puts the gateway behind TLS on its own subdomain, where neither
// the scheme nor the port matches the dev layout — so VITE_API_URL wins when
// set (see echo-client/.env.example) and the host-following default is what dev
// and LAN testing keep using.
export const API_URL = import.meta.env.VITE_API_URL || `http://${API_HOST}:3000`;

const CLIENT_HEADER = isTauri ? 'tauri' : 'browser';

// For browser <img>/<video> pointing at cross-origin /blobs/files/, we need
// `crossorigin="use-credentials"` so the echo_auth cookie is actually sent.
// In Tauri there's no cookie (the token rides in ?t=), so omit it.
export const blobCrossOrigin: 'use-credentials' | undefined = isTauri
	? undefined
	: 'use-credentials';

type TokenResolver = () => string | null;

let getToken: TokenResolver = () => null;

export function setTokenResolver(resolver: TokenResolver) {
	getToken = resolver;
}

let waitForAuth: () => Promise<void> = () => Promise.resolve();

export function setAuthReadyWaiter(fn: () => Promise<void>) {
	waitForAuth = fn;
}

// Tauri appends ?t= (no cookie jar shared with the webview). In the browser we
// rely exclusively on the HttpOnly echo_auth cookie — putting the JWT in a URL
// leaks it to server logs, Referer headers, browser history, and the DevTools
// network panel, so we never do that in the browser context.
export function resolveUrl(path: string | null | undefined): string | null {
	if (!path) return null;
	if (path.startsWith('http') || path.startsWith('blob:')) return path;
	if (isTauri && path.startsWith('/blobs/files/')) {
		const token = getToken();
		if (token) {
			const sep = path.includes('?') ? '&' : '?';
			return `${API_URL}${path}${sep}t=${encodeURIComponent(token)}`;
		}
	}
	return `${API_URL}${path}`;
}

interface RequestOptions {
	method?: string;
	body?: unknown;
	signal?: AbortSignal;
	skipAuthWait?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
	const { method = 'GET', body, signal, skipAuthWait } = options;

	if (!skipAuthWait) await waitForAuth();

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		'X-Client': CLIENT_HEADER,
	};

	const token = getToken();
	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}

	const res = await fetch(`${API_URL}${path}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
		signal,
		credentials: 'include',
	});

	const data = await res.json();

	if (!res.ok) {
		throw new ApiError(data.error ?? 'Request failed', res.status, data);
	}

	return data as T;
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
	const headers: Record<string, string> = {
		'X-Client': CLIENT_HEADER,
	};

	const token = getToken();
	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}

	const res = await fetch(`${API_URL}${path}`, {
		method: 'POST',
		headers,
		body: formData,
		credentials: 'include',
	});

	const data = await res.json();

	if (!res.ok) {
		throw new ApiError(data.error ?? 'Upload failed', res.status, data);
	}

	return data as T;
}

export function apiUploadWithProgress<T>(
	path: string,
	formData: FormData,
	onProgress?: (percent: number) => void,
): { promise: Promise<T>; abort: () => void } {
	const xhr = new XMLHttpRequest();
	const promise = new Promise<T>((resolve, reject) => {
		xhr.open('POST', `${API_URL}${path}`);
		xhr.withCredentials = true;
		xhr.setRequestHeader('X-Client', CLIENT_HEADER);

		const token = getToken();
		if (token) {
			xhr.setRequestHeader('Authorization', `Bearer ${token}`);
		}

		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable && onProgress) {
				onProgress(Math.round((e.loaded / e.total) * 100));
			}
		};

		xhr.onload = () => {
			try {
				const data = JSON.parse(xhr.responseText);
				if (xhr.status >= 200 && xhr.status < 300) {
					resolve(data as T);
				} else {
					reject(new ApiError(data.error ?? 'Upload failed', xhr.status, data));
				}
			} catch {
				reject(new ApiError('Upload failed', xhr.status, null));
			}
		};

		xhr.onerror = () => reject(new ApiError('Network error', 0, null));
		xhr.onabort = () => reject(new ApiError('Upload cancelled', 0, null));

		xhr.send(formData);
	});

	return { promise, abort: () => xhr.abort() };
}

export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
		public data: unknown
	) {
		super(message);
	}
}
