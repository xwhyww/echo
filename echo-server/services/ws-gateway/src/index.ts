import { serve } from '@hono/node-server';
import { app, injectWebSocket } from './app.js';
import { startNatsSubscriber } from './subscriber.js';
import { config } from './config.js';
import { initNats } from './nats.js';
import { log } from './log.js';

async function bootstrap() {
	try {
		await initNats(config.natsUrl);
		await startNatsSubscriber();
	} catch (err: any) {
		log.warn({ err }, 'NATS unavailable');
	}
}

bootstrap();

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
	log.info({ port: info.port }, 'listening');
});

injectWebSocket(server);
