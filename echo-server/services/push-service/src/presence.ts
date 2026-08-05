import { config } from './config.js';
import { log } from './log.js';

/**
 * "Is this user's app currently connected?" — the question that decides whether
 * an event becomes a banner or stays a silent WebSocket update.
 *
 * Asked of ws-gateway directly rather than tracked from the `echo.presence.*`
 * NATS subjects, because those are *privacy-filtered*: a user who sets their
 * online status to "nobody" is published as offline while still very much
 * connected, and would then get every message twice — once in the open app and
 * once as a push. ws-gateway's own connection table has no such filter.
 *
 * On any failure we answer "not connected", which sends the push. Missing a
 * notification is worse than a duplicate one.
 */
export async function isUserConnected(userId: string): Promise<boolean> {
	try {
		const resp = await fetch(`${config.wsGatewayHttpUrl}/internal/presence/${userId}`, {
			headers: { 'X-Internal-Key': config.internalApiKey },
			signal: AbortSignal.timeout(2000),
		});
		if (!resp.ok) return false;
		const data = (await resp.json()) as { online?: boolean };
		return data.online === true;
	} catch (err) {
		log.warn({ err, userId }, 'presence check failed, assuming offline');
		return false;
	}
}
