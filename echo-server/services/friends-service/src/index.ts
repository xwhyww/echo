import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';
import { initNats } from './nats.js';
import { log } from './log.js';

initNats(config.natsUrl).catch((err) => {
	log.warn({ err }, 'NATS unavailable, event publishing disabled');
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
	log.info({ port: info.port }, 'listening');
});
