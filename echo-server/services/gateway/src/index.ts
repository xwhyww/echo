import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';
import { log } from './log.js';
import { closeRateLimiter } from './rateLimit.js';

serve({ fetch: app.fetch, port: config.port }, (info) => {
	log.info({ port: info.port }, 'listening');
});

// The rate limiter may hold a Redis connection; closing it lets the process
// exit promptly instead of waiting on an idle socket.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		void closeRateLimiter().finally(() => process.exit(0));
	});
}
