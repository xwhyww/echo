/**
 * Proxies to blob-service. Kept apart from the rest because these two touch
 * no chat state at all — they are a pass-through with an auth check.
 */
import { Hono } from 'hono';
import {
	config,
	type AuthEnv,
} from './shared.js';

export const routes = new Hono<AuthEnv>();

// Upload files — proxy to blob-service
routes.post('/upload', async (c) => {
	const token = c.req.header('Authorization') ?? '';
	const resp = await fetch(`${config.blobServiceUrl}/blobs/upload`, {
		method: 'POST',
		headers: { Authorization: token },
		body: c.req.raw.body,
		// @ts-expect-error duplex needed for streaming body
		duplex: 'half',
	});
	const data = await resp.json() as { blobs?: unknown[]; error?: string };
	if (!resp.ok) return c.json(data, resp.status as any);
	return c.json({ attachments: data.blobs });
});

// Pre-upload dedup check — proxy to blob-service
routes.post('/upload/check', async (c) => {
	const token = c.req.header('Authorization') ?? '';
	const body = await c.req.text();
	const resp = await fetch(`${config.blobServiceUrl}/blobs/check`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: token },
		body,
	});
	const data = await resp.json();
	return c.json(data, resp.status as any);
});
