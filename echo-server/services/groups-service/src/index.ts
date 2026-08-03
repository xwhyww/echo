import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';
import { createDb } from './db/index.js';
import { initNats } from './nats.js';
import { bootstrapCaches, startCacheReconciler } from './bootstrap.js';

const db = createDb(config.databaseUrl);

(async () => {
	try {
		await bootstrapCaches(db);
	} catch (err) {
		console.error('[groups-service] bootstrap failed:', err);
	}

	initNats(config.natsUrl, db).catch((err) => {
		console.warn('[groups-service] NATS unavailable, event sync disabled:', err.message);
	});
})();

startCacheReconciler(db);

serve({ fetch: app.fetch, port: config.port }, (info) => {
	console.log(`[groups-service] running on http://localhost:${info.port}`);
});
