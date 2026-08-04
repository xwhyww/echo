import { createNatsConnection, setupStreams, type NatsConnection } from '@echo/shared';
import { log } from './log.js';

let nc: NatsConnection | null = null;

export async function initNats(url: string): Promise<void> {
	nc = await createNatsConnection(url);
	await setupStreams(nc);
	log.info('Connected to NATS');
}

export function getNatsConnection(): NatsConnection | null {
	return nc;
}
