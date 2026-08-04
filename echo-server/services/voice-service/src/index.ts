import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';
import { createDb } from './db/index.js';
import { initNats } from './nats.js';
import { bootstrapCaches, startCacheReconciler } from './bootstrap.js';
import { log } from './log.js';

const db = createDb(config.databaseUrl);

(async () => {
	try {
		await bootstrapCaches(db);
	} catch (err) {
		log.error({ err }, 'bootstrap failed');
	}

	initNats(config.natsUrl, db).catch((err) => {
		log.warn({ err }, 'NATS unavailable, event sync disabled');
	});
})();

startCacheReconciler(db);

serve({ fetch: app.fetch, port: config.port }, (info) => {
	log.info({ port: info.port }, 'listening');
});
