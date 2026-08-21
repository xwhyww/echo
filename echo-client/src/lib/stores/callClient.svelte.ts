import {
	Room,
	RoomEvent,
	Track,
	ConnectionState,
	type RemoteTrack,
	type LocalVideoTrack,
	type RemoteVideoTrack,
	type RemoteParticipant,
} from 'livekit-client';
import { ROOM_OPTIONS } from '$lib/voice/roomOptions.js';

// Media layer for a 1-to-1 DM call. Deliberately separate from
// `voiceClient` (which is bound to group voice channels, per-role permissions,
// presence fan-out, and a screen-share grid). A DM call is a simpler thing:
// two equal peers, mic always, camera optional. We lean on LiveKit's built-in
// setMicrophoneEnabled / setCameraEnabled rather than the custom RNNoise mic
// pipeline — fine for a v1 call, and far less to go wrong.

export interface RemoteVideo {
	identity: string;
	track: RemoteVideoTrack;
}

let room: Room | null = null;
// Hidden <audio> elements keeping LiveKit's decoder fed for remote mic tracks.
const audioEls = new Map<string, HTMLMediaElement>();

let connectionState = $state<ConnectionState>(ConnectionState.Disconnected);
let isMuted = $state(false);
let isVideoOn = $state(false);
let localVideoTrack = $state<LocalVideoTrack | null>(null);
let remoteVideo = $state<RemoteVideo | null>(null);
let peerPresent = $state(false);

// Invoked when the remote peer disconnects from the room (they hung up or
// dropped). The orchestration layer uses this to tear the call down on our end.
let onPeerLeft: (() => void) | null = null;

function attachRemoteAudio(track: RemoteTrack) {
	const el = track.attach() as HTMLMediaElement;
	el.style.display = 'none';
	document.body.appendChild(el);
	audioEls.set(track.sid ?? Math.random().toString(36), el);
}

function teardownAudio() {
	for (const el of audioEls.values()) {
		try { el.remove(); } catch { /* already detached */ }
	}
	audioEls.clear();
}

function refreshLocalVideo() {
	if (!room) {
		localVideoTrack = null;
		isVideoOn = false;
		return;
	}
	const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
	localVideoTrack = (pub?.track as LocalVideoTrack | undefined) ?? null;
	isVideoOn = !!localVideoTrack && !pub?.isMuted;
}

function attachListeners(r: Room) {
	r.on(RoomEvent.ConnectionStateChanged, (state) => {
		connectionState = state;
		if (state === ConnectionState.Disconnected) {
			remoteVideo = null;
			peerPresent = false;
		}
	});
	r.on(RoomEvent.ParticipantConnected, () => {
		peerPresent = r.remoteParticipants.size > 0;
	});
	r.on(RoomEvent.ParticipantDisconnected, () => {
		peerPresent = r.remoteParticipants.size > 0;
		if (!peerPresent) onPeerLeft?.();
	});
	r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
		if (track.kind === Track.Kind.Audio) {
			attachRemoteAudio(track);
		} else if (track.kind === Track.Kind.Video) {
			remoteVideo = { identity: participant.identity, track: track as RemoteVideoTrack };
		}
	});
	r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
		if (track.kind === Track.Kind.Video) {
			remoteVideo = null;
		} else if (track.kind === Track.Kind.Audio) {
			track.detach().forEach((el) => el.remove());
		}
	});
	r.on(RoomEvent.LocalTrackPublished, refreshLocalVideo);
	r.on(RoomEvent.LocalTrackUnpublished, refreshLocalVideo);
}

export const callClient = {
	get connectionState() { return connectionState; },
	get isConnected() { return connectionState === ConnectionState.Connected; },
	get isConnecting() { return connectionState === ConnectionState.Connecting; },
	get isMuted() { return isMuted; },
	get isVideoOn() { return isVideoOn; },
	get localVideoTrack() { return localVideoTrack; },
	get remoteVideo() { return remoteVideo; },
	get peerPresent() { return peerPresent; },

	set onPeerLeft(cb: (() => void) | null) { onPeerLeft = cb; },

	async connect(url: string, token: string, opts: { video?: boolean } = {}): Promise<void> {
		await this.disconnect();
		const r = new Room(ROOM_OPTIONS);
		attachListeners(r);
		room = r;
		connectionState = ConnectionState.Connecting;
		try {
			await r.connect(url, token);
			await r.localParticipant.setMicrophoneEnabled(true);
			isMuted = false;
			if (opts.video) {
				await r.localParticipant.setCameraEnabled(true);
			}
			refreshLocalVideo();
			peerPresent = r.remoteParticipants.size > 0;
		} catch (err) {
			await this.disconnect();
			throw err;
		}
	},

	async disconnect(): Promise<void> {
		if (!room) return;
		const r = room;
		room = null;
		try { await r.disconnect(); } catch { /* ignore */ }
		teardownAudio();
		connectionState = ConnectionState.Disconnected;
		isMuted = false;
		isVideoOn = false;
		localVideoTrack = null;
		remoteVideo = null;
		peerPresent = false;
	},

	async toggleMute(): Promise<void> {
		if (!room) return;
		const next = !isMuted;
		await room.localParticipant.setMicrophoneEnabled(!next);
		isMuted = next;
	},

	async toggleVideo(): Promise<void> {
		if (!room) return;
		const next = !isVideoOn;
		await room.localParticipant.setCameraEnabled(next);
		refreshLocalVideo();
	},
};

export { ConnectionState };
