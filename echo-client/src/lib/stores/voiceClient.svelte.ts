import {
	Room,
	RoomEvent,
	Track,
	type Participant,
	ConnectionState,
	ConnectionQuality,
} from 'livekit-client';
import { voiceService } from '$lib/api/voiceService.js';
import type { VoiceChannel } from '$lib/api/voice.js';
import { captureMic, type MicCapture } from '$lib/audio/captureMic.js';
import { getMicrophoneSettings } from '$lib/stores/microphoneSettings.svelte.js';
import { voiceVolumes } from '$lib/stores/voiceVolumes.svelte.js';
import { voiceStats } from '$lib/stores/voiceStats.svelte.js';
import { remoteAudio } from '$lib/audio/remoteAudio.js';
import { ws } from '$lib/stores/ws.svelte.js';
import { call } from '$lib/stores/call.svelte.js';
import { playVoiceJoin, playVoiceLeave } from '$lib/utils/sounds.js';
import { createVoiceAudioState } from '$lib/voice/audioState.svelte.js';
import { createScreenShare, type ScreenShareSurface } from '$lib/voice/screenShare.svelte.js';
import { ROOM_OPTIONS } from '$lib/voice/roomOptions.js';
import {
	snapshotParticipants,
	snapshotScreenShares,
	type VoiceParticipant,
	type VoiceScreenShare,
} from '$lib/utils/voiceSnapshots.js';

// This module stays the public face of the voice subsystem: everything that
// renders a call imports its models from here.
export type { ScreenShareSurface, VoiceParticipant, VoiceScreenShare };

let room: Room | null = null;
// We capture and process the mic ourselves (so RNNoise + the soft limiter can
// be applied), then publish the resulting MediaStreamTrack to LiveKit. Holding
// the capture lets us tear it down on disconnect; holding the publication lets
// us mute/unmute without rebuilding the pipeline.
let micCapture: MicCapture | null = null;
let micTrack: MediaStreamTrack | null = null;

// One subscription drives both the local mic gain and every remote gain.
let unsubVolumes: (() => void) | null = null;

function broadcastPresence(channelId: string, kind: 'joined' | 'left' | 'updated', muted: boolean, deaf: boolean, sharing: boolean) {
	// Fire-and-forget — the sidebar list endpoint is the authoritative
	// fallback. We swallow errors so a transient gateway hiccup never blocks
	// the user from joining/leaving/muting.
	voiceService.presence(channelId, { kind, micMuted: muted, deafened: deaf, sharing }).catch((err) => {
		console.warn('[voiceClient] presence broadcast failed:', err);
	});
}

let currentChannel = $state<VoiceChannel | null>(null);
let participants = $state<VoiceParticipant[]>([]);
let screenShares = $state<VoiceScreenShare[]>([]);
let connectionState = $state<ConnectionState>(ConnectionState.Disconnected);
let speakingIds = $state<Set<string>>(new Set());
// Whether the current channel's role grants screen sharing. Set from the join
// response; the LiveKit token enforces it server-side either way.
let canShare = $state(true);

/** Whatever the three of them currently add up to, sent to the group. */
function announcePresence(sharing = screenShare.isSharing) {
	if (currentChannel) {
		broadcastPresence(currentChannel.id, 'updated', audio.muted, audio.deafened, sharing);
	}
}

// Muted and deafened outlive every room they are applied to, so they are not
// the room's state and don't live with it.
const audio = createVoiceAudioState({
	room: () => room,
	micTrack: () => micTrack,
	onChange: () => {
		refreshParticipants();
		announcePresence();
	},
});

// Presenting a screen — its own subsystem, because it owns MediaStreamTracks
// that are ours rather than LiveKit's. Everything it announces goes out as a
// presence update on the channel we're currently in.
const screenShare = createScreenShare({
	room: () => room,
	// iOS publishes the share over its own LiveKit connection and mints its own
	// token for it, which needs the channel rather than the room.
	channelId: () => currentChannel?.id ?? null,
	announce: (sharing) => announcePresence(sharing),
});

// A `Room` mutates in place, so every event that could have changed it ends in
// one of these: read the room back out into the arrays the UI renders.
function refreshParticipants() {
	participants = snapshotParticipants(room, speakingIds, audio.muted);
}

function refreshShares() {
	screenShares = snapshotScreenShares(room);
}

function refreshAll() {
	refreshParticipants();
	refreshShares();
}

function attachListeners(r: Room) {
	r.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
		connectionState = state;
		if (state === ConnectionState.Disconnected) {
			currentChannel = null;
			participants = [];
			screenShares = [];
			speakingIds = new Set();
		}
	});
	r.on(RoomEvent.ParticipantConnected, () => {
		refreshAll();
		playVoiceJoin();
	});
	r.on(RoomEvent.ParticipantDisconnected, () => {
		refreshAll();
		playVoiceLeave();
	});
	r.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
		speakingIds = new Set(speakers.map((s) => s.identity));
		refreshParticipants();
	});
	r.on(RoomEvent.TrackMuted, refreshParticipants);
	r.on(RoomEvent.TrackUnmuted, refreshParticipants);
	r.on(RoomEvent.LocalTrackPublished, refreshAll);
	r.on(RoomEvent.LocalTrackUnpublished, refreshAll);
	r.on(RoomEvent.TrackPublished, refreshShares);
	r.on(RoomEvent.TrackUnpublished, refreshShares);
	// LiveKit computes a coarse quality bucket per participant from packet loss,
	// jitter, and RTT. We only care about the local user's bucket — that's the
	// signal driving the strength bars in the UI.
	r.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
		if (participant === r.localParticipant) {
			voiceStats.quality = quality;
		}
	});
	// Route remote audio through our AudioContext so per-identity volume (and
	// the deafened toggle) can be applied as a single GainNode value instead of
	// juggling HTMLMediaElement.volume — which also can't go above 1.0.
	r.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
		if (track.kind === Track.Kind.Video) {
			refreshShares();
			return;
		}
		if (track.kind !== Track.Kind.Audio) return;
		const isScreenShareAudio = track.source === Track.Source.ScreenShareAudio;
		remoteAudio.add(participant.identity, track, isScreenShareAudio);
		// hasAudio on the matching VoiceScreenShare must flip true once the
		// audio track lands — otherwise watchers wouldn't see the volume
		// slider until they re-rendered for some other reason.
		if (isScreenShareAudio) refreshShares();
	});
	r.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
		if (track.kind === Track.Kind.Video) {
			refreshShares();
			return;
		}
		if (track.kind !== Track.Kind.Audio) return;
		const isScreenShareAudio = track.source === Track.Source.ScreenShareAudio;
		remoteAudio.remove(participant.identity, track.mediaStreamTrack);
		// LiveKit's track.detach() also tries to clean up attached elements;
		// we already removed ours above, so detach() is a no-op for them.
		track.detach();
		if (isScreenShareAudio) refreshShares();
	});
}

export const voiceClient = {
	get currentChannel() {
		return currentChannel;
	},
	get participants() {
		return participants;
	},
	get connectionState() {
		return connectionState;
	},
	get isConnected() {
		return connectionState === ConnectionState.Connected;
	},
	get isConnecting() {
		return connectionState === ConnectionState.Connecting;
	},
	get isMuted() {
		return audio.muted;
	},
	get isDeafened() {
		return audio.deafened;
	},
	get connectionQuality() {
		return voiceStats.quality;
	},
	get latencyMs() {
		return voiceStats.latencyMs;
	},
	get packetLossPercent() {
		return voiceStats.packetLossPercent;
	},
	get jitterMs() {
		return voiceStats.jitterMs;
	},
	get transport() {
		return voiceStats.transport;
	},
	get candidateType() {
		return voiceStats.candidateType;
	},
	get isScreenSharing() {
		return screenShare.isSharing;
	},
	get isScreenShareAudioMuted() {
		return screenShare.isAudioMuted;
	},
	get screenShares() {
		return screenShares;
	},
	get canShare() {
		return canShare;
	},

	async connect(channelId: string): Promise<void> {
		if (room && currentChannel?.id === channelId && connectionState === ConnectionState.Connected) {
			return;
		}
		// A 1-to-1 call and a group voice channel both own the mic — they're
		// mutually exclusive. End any in-progress call before joining voice.
		if (call.status !== 'idle') {
			await call.dismiss();
		}
		await this.disconnect();

		const { url, token, channel, canShare: granted } = await voiceService.join(channelId);
		canShare = granted;

		const r = new Room(ROOM_OPTIONS);
		attachListeners(r);
		room = r;
		connectionState = ConnectionState.Connecting;
		try {
			await r.connect(url, token);
			// Capture and process the mic before publishing so RNNoise + limiter
			// settings apply on voice channels (not just voice messages). The
			// returned track is published as a Microphone source so LiveKit
			// metadata, mute UI, and selective subscription behave normally.
			const settings = getMicrophoneSettings();
			micCapture = await captureMic(settings);
			micCapture.gain.gain.value = voiceVolumes.micGain;
			const tracks = micCapture.stream.getAudioTracks();
			if (tracks.length === 0) {
				throw new Error('processed mic stream has no audio tracks');
			}
			micTrack = tracks[0];
			await r.localParticipant.publishTrack(micTrack, {
				source: Track.Source.Microphone,
			});
			currentChannel = channel;

			// Drive both the local mic gain and remote per-identity gains from the
			// shared voiceVolumes store. One subscription handles every change.
			unsubVolumes?.();
			unsubVolumes = voiceVolumes.subscribe(() => {
				if (micCapture) micCapture.gain.gain.value = voiceVolumes.micGain;
				remoteAudio.applyAll();
			});

			// Both flags survive the switch onto this fresh room. We don't reset
			// them to false — that surprised users who'd muted themselves before
			// changing channel.
			await audio.restore(r);

			refreshParticipants();
			broadcastPresence(channel.id, 'joined', audio.muted, audio.deafened, screenShare.isSharing);
			voiceStats.start(r);
			playVoiceJoin();
		} catch (err) {
			unsubVolumes?.();
			unsubVolumes = null;
			remoteAudio.teardown();
			micCapture?.cleanup();
			micCapture = null;
			micTrack = null;
			room = null;
			voiceStats.stop();
			connectionState = ConnectionState.Disconnected;
			currentChannel = null;
			throw err;
		}
	},

	async disconnect(): Promise<void> {
		if (!room) return;
		playVoiceLeave();
		const r = room;
		const leftChannelId = currentChannel?.id ?? null;
		const wasMuted = audio.muted;
		const wasDeafened = audio.deafened;
		// Stop the screen-share tracks before tearing down the room so the
		// browser's "Stop sharing" indicator goes away cleanly. Silent: the
		// 'left' presence event below already tells subscribers we're gone.
		await screenShare.teardown({ silent: true });
		room = null;
		voiceStats.stop();
		try {
			await r.disconnect();
		} catch (err) {
			console.warn('[voiceClient] disconnect error:', err);
		}
		unsubVolumes?.();
		unsubVolumes = null;
		remoteAudio.teardown();
		micCapture?.cleanup();
		micCapture = null;
		micTrack = null;
		currentChannel = null;
		participants = [];
		screenShares = [];
		speakingIds = new Set();
		// Intentionally NOT touching muted/deafened: those are user preferences
		// that survive across channel switches and reloads, which is why they
		// belong to `audio` and not to the room being torn down here.
		connectionState = ConnectionState.Disconnected;
		if (leftChannelId) {
			broadcastPresence(leftChannelId, 'left', wasMuted, wasDeafened, false);
		}
	},

	setMuted: audio.setMuted,
	toggleMuted: audio.toggleMuted,
	setDeafened: audio.setDeafened,
	toggleDeafened: audio.toggleDeafened,

	startScreenShare: screenShare.start,
	stopScreenShare: screenShare.stop,
	setScreenShareAudioMuted: screenShare.setAudioMuted,
	toggleScreenShareAudioMuted: screenShare.toggleAudioMuted,
};

// If the channel we're currently in gets deleted by an admin, drop the
// LiveKit connection. The server also tears down the LiveKit room which
// would disconnect us anyway, but reacting to the WS event makes the
// teardown deterministic and avoids the brief window between admin click
// and LiveKit propagation.
ws.on((event) => {
	if (event.type !== 'voice_channel_deleted') return;
	if (currentChannel?.id !== event.channelId) return;
	void voiceClient.disconnect();
});

export { ConnectionState, ConnectionQuality };
