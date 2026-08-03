import { serve } from '@hono/node-server';
import { app, injectWebSocket } from './app.js';
import { startNatsSubscriber } from './subscriber.js';
import { config } from './config.js';
import { initNats } from './nats.js';

async function bootstrap() {
	try {
		await initNats(config.natsUrl);
		await startNatsSubscriber();
	} catch (err: any) {
		console.warn('[ws-gateway] NATS unavailable:', err.message);
	}
}

bootstrap();

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
	console.log(`[ws-gateway] running on http://localhost:${info.port}`);
});

injectWebSocket(server);
