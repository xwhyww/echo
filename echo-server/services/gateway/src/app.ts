import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { config } from './config.js';

export const app = new Hono();

// Vite doesn't guarantee a port (5173 busy -> 5174, ...), so accept any port on
// the allowed hosts.
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
// Private LAN ranges (10/8, 172.16/12, 192.168/16), so the dev build opened
// from a phone on the same wifi isn't blocked. Dev only — a deployed gateway
// has no business trusting LAN origins with credentials.
const LAN_ORIGIN =
	/^http:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}):\d+$/;
const isDev = process.env.NODE_ENV !== 'production';

function isAllowedOrigin(origin: string): boolean {
	if (origin === 'tauri://localhost') return true;
	if (LOCAL_ORIGIN.test(origin)) return true;
	return isDev && LAN_ORIGIN.test(origin);
}

app.use('*', logger());
app.use(
	'*',
	cors({
		origin: (origin) => (isAllowedOrigin(origin) ? origin : null),
		allowHeaders: ['Content-Type', 'Authorization', 'X-Client'],
		allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		credentials: true,
	})
);

const SERVICE_MAP: Record<string, string> = {
	'/auth': config.authServiceUrl,
	'/users': config.userServiceUrl,
	'/personal-chats': config.persChatsServiceUrl,
	'/friends': config.friendsServiceUrl,
	'/blobs': config.blobServiceUrl,
	'/groups': config.groupsServiceUrl,
	'/voice': config.voiceServiceUrl,
};

app.get('/health', (c) => c.json({ status: 'ok' }));

app.get('/ws-info', (c) =>
	c.json({ url: `${config.wsGatewayUrl}/ws` })
);

// Proxy routes (CORS preflight is handled by the cors() middleware above)
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
for (const prefix of ['/auth', '/users', '/personal-chats', '/friends', '/blobs', '/groups', '/voice']) {
	app.on(METHODS, `${prefix}/*`, proxy(prefix));
	app.on(METHODS, prefix, proxy(prefix));
	app.on(METHODS, `${prefix}/`, proxy(prefix));
}

function proxy(prefix: string) {
	return async (c: any) => {
		const target = SERVICE_MAP[prefix];
		if (!target) {
			return c.json({ error: 'Service not found' }, 502);
		}

		const url = new URL(c.req.url);
		const targetUrl = `${target}${url.pathname}${url.search}`;

		const headers = new Headers(c.req.raw.headers);
		headers.delete('host');

		try {
			const resp = await fetch(targetUrl, {
				method: c.req.method,
				headers,
				body: c.req.method !== 'GET' && c.req.method !== 'HEAD'
					? c.req.raw.body
					: undefined,
				// @ts-expect-error duplex needed for streaming body
				duplex: 'half',
			});

			const respHeaders = new Headers(resp.headers);
			// Remove upstream CORS headers so Hono's cors() middleware controls them
			respHeaders.delete('access-control-allow-origin');
			respHeaders.delete('access-control-allow-methods');
			respHeaders.delete('access-control-allow-headers');
			respHeaders.delete('access-control-allow-credentials');

			return new Response(resp.body, {
				status: resp.status,
				statusText: resp.statusText,
				headers: respHeaders,
			});
		} catch {
			return c.json({ error: 'Service unavailable' }, 502);
		}
	};
}
