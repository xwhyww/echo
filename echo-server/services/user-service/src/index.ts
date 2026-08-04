import { serve } from '@hono/node-server';
import { eq } from 'drizzle-orm';
import { app } from './app.js';
import { config } from './config.js';
import { createDb } from './db/index.js';
import { userProfiles } from './db/schema.js';
import { initNats } from './nats.js';
import { log } from './log.js';

const db = createDb(config.databaseUrl);

// Reset all online statuses on startup — no WS connections exist yet,
// so any leftover isOnline=true values are stale from a previous run.
db.update(userProfiles)
	.set({ isOnline: false })
	.where(eq(userProfiles.isOnline, true))
	.then(() => log.info('Cleared stale online statuses'))
	.catch((err) => log.error({ err }, 'Failed to clear stale online statuses'));

initNats(config.natsUrl, db).catch((err) => {
	log.warn({ err }, 'NATS unavailable, event sync disabled');
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
	log.info({ port: info.port }, 'listening');
});
