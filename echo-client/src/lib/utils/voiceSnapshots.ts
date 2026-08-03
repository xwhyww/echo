import { Track, type LocalVideoTrack, type Participant, type RemoteVideoTrack, type Room } from 'livekit-client';

/**
 * Turning a LiveKit `Room` into the models the UI renders.
 *
 * A `Room` is a live object graph that mutates in place; Svelte can't see into
 * it, so every relevant event re-reads the whole thing into plain arrays. That
 * re-read is a pure transformation of the room plus the little state LiveKit
 * doesn't hold for us (who is speaking, whether our own mic is muted) — which
 * is why it lives here and not in the store that owns the connection.
 */

export interface VoiceParticipant {
	identity: string;
	name: string;
	isSpeaking: boolean;
	isMuted: boolean;
	isLocal: boolean;
}

export interface VoiceScreenShare {
	identity: string;
	name: string;
	isLocal: boolean;
	// Both LocalVideoTrack and RemoteVideoTrack expose .attach()/.detach(), which
	// is all the UI needs to wire a <video> element to the underlying stream.
	track: LocalVideoTrack | RemoteVideoTrack;
	// True when the presenter also published a ScreenShareAudio track. Watchers
	// use this to decide whether to render a volume slider; presenters use it
	// to decide whether to render the share-audio mute toggle.
	hasAudio: boolean;
}

function displayName(p: Participant): string {
	return p.name || p.identity;
}

/**
 * A remote publication only carries a track once we're subscribed to it; our
 * own always does, and `isSubscribed` doesn't mean anything there.
 */
function isUsable(pub: { track?: unknown; isSubscribed: boolean }, isLocal: boolean): boolean {
	return !!pub.track && (isLocal || pub.isSubscribed);
}

function hasShareAudio(p: Participant, isLocal: boolean): boolean {
	const pub = p.getTrackPublication(Track.Source.ScreenShareAudio);
	return !!pub && isUsable(pub, isLocal);
}

function shareVideoTracks(p: Participant, isLocal: boolean): (LocalVideoTrack | RemoteVideoTrack)[] {
	const tracks: (LocalVideoTrack | RemoteVideoTrack)[] = [];
	for (const pub of p.trackPublications.values()) {
		if (pub.source !== Track.Source.ScreenShare) continue;
		if (!isUsable(pub, isLocal)) continue;
		if (pub.track!.kind !== Track.Kind.Video) continue;
		tracks.push(pub.track as LocalVideoTrack | RemoteVideoTrack);
	}
	return tracks;
}

/** Everyone in the room, us first — the order the stage renders them in. */
function everyone(room: Room): { p: Participant; isLocal: boolean }[] {
	return [
		{ p: room.localParticipant, isLocal: true },
		...[...room.remoteParticipants.values()].map((p) => ({ p, isLocal: false })),
	];
}

export function snapshotParticipants(
	room: Room | null,
	speakingIds: Set<string>,
	localMuted: boolean,
): VoiceParticipant[] {
	if (!room) return [];
	return everyone(room).map(({ p, isLocal }) => ({
		identity: p.identity,
		name: displayName(p),
		isSpeaking: speakingIds.has(p.identity),
		// Our own mute is the flag we keep: the local publication reports muted
		// only after the round trip, and the button must not lag behind the click.
		isMuted: isLocal ? localMuted : !p.isMicrophoneEnabled,
		isLocal,
	}));
}

export function snapshotScreenShares(room: Room | null): VoiceScreenShare[] {
	if (!room) return [];
	const list: VoiceScreenShare[] = [];
	for (const { p, isLocal } of everyone(room)) {
		const hasAudio = hasShareAudio(p, isLocal);
		for (const track of shareVideoTracks(p, isLocal)) {
			list.push({ identity: p.identity, name: displayName(p), isLocal, track, hasAudio });
		}
	}
	return list;
}
