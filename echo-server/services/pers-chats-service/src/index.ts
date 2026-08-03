import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';
import { createDb } from './db/index.js';
import { initNats } from './nats.js';
import { bootstrapCaches, startCacheReconciler } from './bootstrap.js';

const db = createDb(config.databaseUrl);

// Bootstrap before NATS subscribe so any in-flight events during the
// hydration window land on top of fresh data. Both orderings are safe because
// the upserts are idempotent.
(async () => {
	try {
		await bootstrapCaches(db);
	} catch (err) {
		console.error('[pers-chats-service] bootstrap failed:', err);
	}

	initNats(config.natsUrl, db).catch((err) => {
		console.warn('[pers-chats-service] NATS unavailable, event sync disabled:', err.message);
	});
})();

startCacheReconciler(db);

serve({ fetch: app.fetch, port: config.port }, (info) => {
	console.log(`[pers-chats-service] running on http://localhost:${info.port}`);
});
