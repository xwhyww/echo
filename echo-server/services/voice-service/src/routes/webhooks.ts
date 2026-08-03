import { Hono } from 'hono';
import { WebhookReceiver } from 'livekit-server-sdk';
import { config } from '../config.js';
import { channelIdFromRoom, participantStateFrom } from '../livekit.js';
import { fanOutParticipantEvent } from '../presence.js';

// LiveKit's server-side view of who is actually connected.
//
// The client also announces its own join/leave over POST /channels/:id/presence,
// but that only covers graceful exits. A tab that is closed, a laptop that
// sleeps or a network that drops never sends anything, so without this receiver
// the departed participant lingers in every other member's sidebar until they
// re-fetch. LiveKit notices the dead session and tells us here.
//
// Both paths publish the same NATS event and the client applies it as a
// replace-or-remove keyed by userId, so the duplicate pair emitted on a normal
// leave (client POST + this webhook) is harmless.
export const webhooksRoutes = new Hono();

let _receiver: WebhookReceiver | null = null;
function receiver(): WebhookReceiver {
	if (!_receiver) {
		_receiver = new WebhookReceiver(config.livekitApiKey, config.livekitApiSecret);
	}
	return _receiver;
}

webhooksRoutes.post('/webhooks/livekit', async (c) => {
	// Signature verification hashes the exact bytes LiveKit signed, so the raw
	// body has to be read as text — parsing it first would break the check.
	const raw = await c.req.text();
	const authHeader = c.req.header('Authorization');

	let event;
	try {
		event = await receiver().receive(raw, authHeader);
	} catch (err) {
		// Unsigned or tampered payload. This endpoint is deliberately outside the
		// JWT auth middleware, so the signature is the only thing standing between
		// the outside world and forged presence events — reject loudly.
		console.warn('[voice] rejected LiveKit webhook:', err);
		return c.json({ error: 'invalid signature' }, 401);
	}

	if (event.event !== 'participant_joined' && event.event !== 'participant_left') {
		// room_started / room_finished / track_* carry nothing the sidebar needs:
		// LiveKit emits participant_left for each occupant before a room finishes,
		// and mic/screen-share changes already arrive via the client's own
		// `updated` presence call.
		return c.json({ ok: true });
	}

	const room = event.room?.name;
	const participant = event.participant;
	if (!room || !participant?.identity) return c.json({ ok: true });

	// 1-to-1 calls share this LiveKit instance under a `dmcall:` prefix and have
	// their own signalling; only group voice channels belong here.
	const channelId = channelIdFromRoom(room);
	if (!channelId) return c.json({ ok: true });

	const kind = event.event === 'participant_joined' ? 'joined' : 'left';
	const state = participantStateFrom(participant);

	try {
		await fanOutParticipantEvent({
			channelId,
			userId: participant.identity,
			kind,
			state: { micMuted: state.micMuted, deafened: state.deafened, sharing: state.sharing },
		});
	} catch (err) {
		// Swallow: a non-2xx makes LiveKit retry, and a retry can't fix a bad
		// channel row or a NATS outage. The channel list endpoint still reconciles
		// against LiveKit on the next open.
		console.error('[voice] livekit webhook fan-out failed:', err);
	}

	return c.json({ ok: true });
});
