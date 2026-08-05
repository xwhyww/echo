import { Hono } from 'hono';
import { WebhookReceiver } from 'livekit-server-sdk';
import { config } from '../config.js';
import {
	baseIdentity,
	channelIdFromRoom,
	getParticipantState,
	isScreenIdentity,
	participantStateFrom,
} from '../livekit.js';
import { fanOutParticipantEvent } from '../presence.js';
import { log } from '../log.js';

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
		log.warn({ err }, 'rejected LiveKit webhook');
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

	const joined = event.event === 'participant_joined';

	// An iOS screen-share sidecar (`<userId>#screen`) is not a participant — it
	// is one user starting or stopping a presentation over a second connection.
	// Emitting it verbatim would put a silent ghost in everyone's sidebar, so it
	// is re-expressed as an `updated` for the user it belongs to.
	//
	// Its own mic/deafened flags are meaningless (it publishes no mic and sets no
	// attributes), so the owner's real state is read back from LiveKit. If they
	// aren't connected there is nothing to update: that is the ordinary race
	// where a sidecar outlives the disconnect that killed it.
	//
	// This path is a backstop rather than the main signal — a client that starts
	// or stops a broadcast normally announces it over /presence, and does so as
	// soon as frames flow rather than at connect. What only this catches is the
	// ungraceful end: the app killed mid-broadcast, where no announcement ever
	// comes and the sidecar's death is the sole evidence.
	let userId = participant.identity;
	let kind: 'joined' | 'left' | 'updated' = joined ? 'joined' : 'left';
	let state = participantStateFrom(participant);

	if (isScreenIdentity(participant.identity)) {
		userId = baseIdentity(participant.identity);
		kind = 'updated';
		const owner = await getParticipantState(channelId, userId);
		if (!owner) return c.json({ ok: true });
		// On join, `owner` is authoritative: a sidecar that hasn't published yet
		// correctly reports the user as not sharing. On leave it is not, because
		// LiveKit may still be listing the participant we were just told about —
		// and its departure is exactly what we're recording.
		state = joined ? owner : { ...owner, sharing: false };
	}

	try {
		await fanOutParticipantEvent({
			channelId,
			userId,
			kind,
			state: { micMuted: state.micMuted, deafened: state.deafened, sharing: state.sharing },
		});
	} catch (err) {
		// Swallow: a non-2xx makes LiveKit retry, and a retry can't fix a bad
		// channel row or a NATS outage. The channel list endpoint still reconciles
		// against LiveKit on the next open.
		log.error({ err }, 'livekit webhook fan-out failed');
	}

	return c.json({ ok: true });
});
