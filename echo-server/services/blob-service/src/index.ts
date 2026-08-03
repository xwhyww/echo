import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';
import { createDb } from './db/index.js';
import { initNats } from './nats.js';
import { startPendingGrantsGC } from './gc.js';
import { bootstrapDmChatMembers, bootstrapGroupMembers } from './bootstrap.js';

const db = createDb(config.databaseUrl);

// Bootstrap before NATS subscribe: any chat created during the bootstrap
// window also publishes a NATS event, and onConflictDoNothing on the mirror
// table makes both orderings idempotent. NATS subscribe is fire-and-forget.
(async () => {
	try {
		await bootstrapDmChatMembers(db);
	} catch (err) {
		console.error('[blob-service] bootstrap dm failed:', err);
	}
	try {
		await bootstrapGroupMembers(db);
	} catch (err) {
		console.error('[blob-service] bootstrap groups failed:', err);
	}

	initNats(config.natsUrl, db).catch((err) => {
		console.error('[blob-service] NATS init failed:', err);
	});
})();

startPendingGrantsGC(db);

serve({ fetch: app.fetch, port: config.port }, (info) => {
	console.log(`[blob-service] running on http://localhost:${info.port}`);
});
