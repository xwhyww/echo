import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';
import { createDb } from './db/index.js';
import { initNats } from './nats.js';
import { startPendingGrantsGC } from './gc.js';
import { bootstrapDmChatMembers, bootstrapGroupMembers } from './bootstrap.js';
import { log } from './log.js';

const db = createDb(config.databaseUrl);

// Bootstrap before NATS subscribe: any chat created during the bootstrap
// window also publishes a NATS event, and onConflictDoNothing on the mirror
// table makes both orderings idempotent. NATS subscribe is fire-and-forget.
(async () => {
	try {
		await bootstrapDmChatMembers(db);
	} catch (err) {
		log.error({ err }, 'bootstrap dm failed');
	}
	try {
		await bootstrapGroupMembers(db);
	} catch (err) {
		log.error({ err }, 'bootstrap groups failed');
	}

	initNats(config.natsUrl, db).catch((err) => {
		log.error({ err }, 'NATS init failed');
	});
})();

startPendingGrantsGC(db);

serve({ fetch: app.fetch, port: config.port }, (info) => {
	log.info({ port: info.port }, 'listening');
});
