import { createNatsConnection, setupStreams, type NatsConnection } from '@echo/shared';

let nc: NatsConnection | null = null;

export async function initNats(url: string): Promise<void> {
	nc = await createNatsConnection(url);
	await setupStreams(nc);
	console.log('[ws-gateway] Connected to NATS');
}

export function getNatsConnection(): NatsConnection | null {
	return nc;
}
