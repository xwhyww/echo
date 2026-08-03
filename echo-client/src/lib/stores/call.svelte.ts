import { ws, type CallParty } from '$lib/stores/ws.svelte.js';
import { callClient } from '$lib/stores/callClient.svelte.js';
import { voiceClient } from '$lib/stores/voiceClient.svelte.js';
import { callsService } from '$lib/api/callsService.js';
import { startIncomingRing, startOutgoingRing, stopAllRings } from '$lib/utils/sounds.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';

// A DM call and a group voice channel both publish the local mic over LiveKit,
// so a user can only be in one at a time. Leave any voice channel before we
// take over the mic for a call.
async function leaveGroupVoice(): Promise<void> {
	if (voiceClient.isConnected || voiceClient.isConnecting) {
		await voiceClient.disconnect();
	}
}

// Orchestrates the 1-to-1 call lifecycle: maps the call_* WebSocket signals to
// a small state machine and drives `callClient` (the LiveKit media layer).
//
//   idle ─ startCall ─▶ outgoing ─ call_accepted ─▶ active ─ hangUp/ended ─▶ idle
//   idle ─ call_ring ─▶ incoming ─ accept ────────▶ active
//
// Both peers connect to the same deterministic LiveKit room; the caller joins
// on invite and waits, the callee joins on accept.

export type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'active';

const RING_TIMEOUT_MS = 35_000;

let status = $state<CallStatus>('idle');
let peer = $state<CallParty | null>(null);
let roomName = $state<string | null>(null);
let incomingVideo = $state(false);
let notice = $state<string | null>(null);
// When true the full call screen is minimized to the sidebar dock so the user
// can keep browsing chats mid-call. Always reset to expanded on a fresh call.
let collapsed = $state(false);

let ringTimer: ReturnType<typeof setTimeout> | null = null;

function clearRingTimer() {
	if (ringTimer) {
		clearTimeout(ringTimer);
		ringTimer = null;
	}
}

function reset() {
	clearRingTimer();
	stopAllRings();
	status = 'idle';
	peer = null;
	roomName = null;
	incomingVideo = false;
	collapsed = false;
}

function flashNotice(msg: string) {
	notice = msg;
	setTimeout(() => {
		if (notice === msg) notice = null;
	}, 3000);
}

// When the remote peer drops the LiveKit room mid-call, end on our side too.
callClient.onPeerLeft = () => {
	if (status === 'active') {
		void callClient.disconnect();
		reset();
	}
};

export const call = {
	get status() { return status; },
	get peer() { return peer; },
	get incomingVideo() { return incomingVideo; },
	get notice() { return notice; },
	get isActive() { return status === 'active'; },
	get isRinging() { return status === 'outgoing' || status === 'incoming'; },
	get collapsed() { return collapsed; },
	// True when the call should occupy the main area as a full screen.
	get showScreen() { return (status === 'outgoing' || status === 'active') && !collapsed; },
	// True when the minimized dock should show in the sidebar.
	get showDock() { return (status === 'outgoing' || status === 'active') && collapsed; },
	// Re-exported so the call UI can read media state from one place.
	get client() { return callClient; },

	collapse() { collapsed = true; },
	expand() { collapsed = false; },

	async startCall(target: CallParty, video = false): Promise<void> {
		// Already in (or ringing) a call — one call at a time.
		if (status !== 'idle') {
			flashNotice(i18n.t.call.alreadyInCall);
			return;
		}
		await leaveGroupVoice();
		peer = target;
		status = 'outgoing';
		incomingVideo = video;
		startOutgoingRing();
		try {
			const info = await callsService.invite(target.id, video);
			roomName = info.roomName;
			await callClient.connect(info.url, info.token, { video });
			// If the callee doesn't pick up, give up automatically.
			clearRingTimer();
			ringTimer = setTimeout(() => {
				if (status === 'outgoing') void this.cancel();
			}, RING_TIMEOUT_MS);
		} catch (err) {
			console.error('[call] invite failed', err);
			await callClient.disconnect();
			flashNotice(i18n.t.call.couldNotStart);
			reset();
		}
	},

	async accept(): Promise<void> {
		if (status !== 'incoming' || !peer) return;
		await leaveGroupVoice();
		const target = peer;
		const video = incomingVideo;
		try {
			const info = await callsService.accept(target.id);
			roomName = info.roomName;
			await callClient.connect(info.url, info.token, { video });
			stopAllRings();
			status = 'active';
		} catch (err) {
			console.error('[call] accept failed', err);
			await callClient.disconnect();
			flashNotice(i18n.t.call.couldNotJoin);
			reset();
		}
	},

	async decline(): Promise<void> {
		if (status !== 'incoming' || !peer) return;
		const target = peer;
		reset();
		await callsService.decline(target.id).catch(() => {});
	},

	async cancel(): Promise<void> {
		if (status !== 'outgoing' || !peer) return;
		const target = peer;
		await callClient.disconnect();
		reset();
		await callsService.cancel(target.id).catch(() => {});
	},

	async hangUp(): Promise<void> {
		const target = peer;
		await callClient.disconnect();
		reset();
		if (target) await callsService.end(target.id).catch(() => {});
	},

	// End the current call whatever its phase — used when the user joins a group
	// voice channel (the two can't coexist). Picks the phase-correct teardown so
	// the peer gets the right signal (cancel vs decline vs end).
	async dismiss(): Promise<void> {
		if (status === 'outgoing') return this.cancel();
		if (status === 'incoming') return this.decline();
		if (status === 'active') return this.hangUp();
	},
};

// ─── Signalling ─────────────────────────────────────────────────
ws.on((event) => {
	switch (event.type) {
		case 'call_ring': {
			// Already busy → auto-decline so the caller isn't left ringing forever.
			if (status !== 'idle') {
				callsService.decline(event.from.id).catch(() => {});
				return;
			}
			peer = event.from;
			roomName = event.roomName;
			incomingVideo = event.video;
			status = 'incoming';
			startIncomingRing();
			break;
		}
		case 'call_accepted': {
			if (status === 'outgoing' && peer && event.fromUserId === peer.id) {
				clearRingTimer();
				stopAllRings();
				status = 'active';
			}
			break;
		}
		case 'call_declined': {
			if (status === 'outgoing' && peer && event.fromUserId === peer.id) {
				void callClient.disconnect();
				reset();
				flashNotice(i18n.t.call.declined);
			}
			break;
		}
		case 'call_cancelled': {
			// Caller gave up before we answered.
			if (status === 'incoming' && peer && event.fromUserId === peer.id) {
				reset();
				flashNotice(i18n.t.call.missed);
			}
			break;
		}
		case 'call_ended': {
			if (peer && event.fromUserId === peer.id && status !== 'idle') {
				void callClient.disconnect();
				reset();
			}
			break;
		}
	}
});
