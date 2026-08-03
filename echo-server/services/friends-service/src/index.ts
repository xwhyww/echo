import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';
import { initNats } from './nats.js';

initNats(config.natsUrl).catch((err) => {
	console.warn('[friends-service] NATS unavailable, event publishing disabled:', err.message);
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
	console.log(`[friends-service] running on http://localhost:${info.port}`);
});
