import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';
import { log } from './log.js';

serve({ fetch: app.fetch, port: config.port }, (info) => {
	log.info({ port: info.port }, 'listening');
});
