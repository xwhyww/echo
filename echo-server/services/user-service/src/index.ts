import { serve } from '@hono/node-server';
import { eq } from 'drizzle-orm';
import { app } from './app.js';
import { config } from './config.js';
import { createDb } from './db/index.js';
import { userProfiles } from './db/schema.js';
import { initNats } from './nats.js';

const db = createDb(config.databaseUrl);

// Reset all online statuses on startup — no WS connections exist yet,
// so any leftover isOnline=true values are stale from a previous run.
db.update(userProfiles)
	.set({ isOnline: false })
	.where(eq(userProfiles.isOnline, true))
	.then(() => console.log('[user-service] Cleared stale online statuses'))
	.catch((err) => console.error('[user-service] Failed to clear stale online statuses:', err));

initNats(config.natsUrl, db).catch((err) => {
	console.warn('[user-service] NATS unavailable, event sync disabled:', err.message);
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
	console.log(`[user-service] running on http://localhost:${info.port}`);
});
