import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config, apnsConfigured } from './config.js';
import { initNats } from './nats.js';
import { startNatsSubscriber } from './subscriber.js';
import { closeApns } from './apns.js';
import { log } from './log.js';

if (!apnsConfigured) {
	log.warn(
		'APNS_KEY_PATH / APNS_KEY_ID / APNS_TEAM_ID / APNS_BUNDLE_ID not all set — ' +
			'device registration works, notifications are logged instead of sent',
	);
}

initNats(config.natsUrl)
	.then(() => startNatsSubscriber())
	.catch((err) => {
		log.warn({ err }, 'NATS unavailable, push delivery disabled');
	});

serve({ fetch: app.fetch, port: config.port }, (info) => {
	log.info({ port: info.port }, 'listening');
});

// APNs holds a long-lived HTTP/2 session; closing it lets the process exit
// promptly instead of waiting on an idle socket.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		closeApns();
		process.exit(0);
	});
}
