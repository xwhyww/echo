import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { config } from './config.js';
import { log } from './log.js';

const TOKEN_TTL_SECONDS = 5 * 60;

// RoomServiceClient talks HTTP, but config.livekitUrl is the ws:// URL the
// LiveKit SDK expects for WebSocket signalling. Swap the scheme so we can
// reuse the same env var for both.
function toHttpUrl(livekitUrl: string): string {
	if (livekitUrl.startsWith('wss://')) return 'https://' + livekitUrl.slice('wss://'.length);
	if (livekitUrl.startsWith('ws://')) return 'http://' + livekitUrl.slice('ws://'.length);
	return livekitUrl;
}

let _roomService: RoomServiceClient | null = null;
function roomService(): RoomServiceClient {
	if (!_roomService) {
		_roomService = new RoomServiceClient(
			toHttpUrl(config.livekitUrl),
			config.livekitApiKey,
			config.livekitApiSecret,
		);
	}
	return _roomService;
}

// ─── Screen sidecar identities ─────────────────────────────────
//
// iOS cannot screen share from the webview: WKWebView has no getDisplayMedia,
// and ReplayKit's broadcast extension hands its frames to the *native* process,
// which has no way to inject a track into the webview's sealed WebRTC stack.
// So an iPhone presenting a screen opens a second, native LiveKit connection
// that publishes nothing but the share.
//
// LiveKit evicts the older session when two connections claim one identity, so
// the sidecar must join under its own: `<userId>#screen`. `#` is safe here
// because our identities are UUIDs and can never contain one.
//
// Everything downstream of LiveKit — sidebar heads, the participant cap, the
// presence firehose — must fold that sidecar back onto the user it belongs to,
// or a presenting iPhone shows up as a second, silent ghost in the channel.
const SCREEN_SUFFIX = '#screen';

export function screenIdentity(userId: string): string {
	return userId + SCREEN_SUFFIX;
}

export function isScreenIdentity(identity: string): boolean {
	return identity.endsWith(SCREEN_SUFFIX);
}

/** The user behind an identity, whether or not it is a sidecar. */
export function baseIdentity(identity: string): string {
	return isScreenIdentity(identity) ? identity.slice(0, -SCREEN_SUFFIX.length) : identity;
}

export async function createJoinToken(opts: {
	channelId: string;
	userId: string;
	displayName: string;
	// SPEAK permission: when false, the microphone source is withheld from the
	// token so the user is effectively server-side muted.
	canSpeak?: boolean;
	// CAN_SHARE permission: when false, the screen-share sources are withheld so
	// a tampered client still can't present. Both default to true (open channel).
	canShare?: boolean;
}): Promise<string> {
	const token = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
		identity: opts.userId,
		name: opts.displayName,
		ttl: TOKEN_TTL_SECONDS,
	});

	// Build an explicit source allowlist. Setting canPublishSources supersedes
	// canPublish, so the user can only publish the exact track sources granted.
	// An empty list means publish nothing (listen-only) — they can still
	// subscribe and send data (presence attributes, deafened flag, etc.).
	const sources: TrackSource[] = [];
	if (opts.canSpeak ?? true) sources.push(TrackSource.MICROPHONE);
	if (opts.canShare ?? true) sources.push(TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO);

	token.addGrant({
		roomJoin: true,
		room: roomName(opts.channelId),
		canPublish: sources.length > 0,
		// Omit the source list entirely in the listen-only case so we don't rely
		// on an empty array being interpreted as "nothing"; canPublish:false is
		// the authoritative gate there.
		canPublishSources: sources.length > 0 ? sources : undefined,
		canSubscribe: true,
		canPublishData: true,
	});

	return await token.toJwt();
}

// Token for the native screen-share sidecar described above. Publish-only and
// subscribe-nothing: the user's real connection is already subscribed to the
// room, and a second subscriber would double every downstream track.
//
// Gated on CAN_SHARE by the caller, and enforced here too — the source
// allowlist is what a tampered client actually runs into.
export async function createScreenToken(opts: {
	channelId: string;
	userId: string;
	displayName: string;
}): Promise<string> {
	const token = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
		identity: screenIdentity(opts.userId),
		name: opts.displayName,
		ttl: TOKEN_TTL_SECONDS,
	});
	token.addGrant({
		roomJoin: true,
		room: roomName(opts.channelId),
		canPublish: true,
		canPublishSources: [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
		canSubscribe: false,
		// No presence attributes come from this connection — the user's real one
		// owns muted/deafened.
		canPublishData: false,
	});
	return await token.toJwt();
}

export function roomName(channelId: string): string {
	return `voice:${channelId}`;
}

// Deterministic room name for a 1-to-1 call between two users. Sorting the ids
// means both the caller's invite and the callee's accept resolve to the same
// LiveKit room regardless of who initiated.
export function callRoomName(userA: string, userB: string): string {
	return `dmcall:${[userA, userB].sort().join(':')}`;
}

// Token for a 1-to-1 call. Unlike channel tokens, calls always grant the full
// publish set (mic + camera + screen share) — there are no per-role voice
// permissions in a DM, both parties are equal peers.
export async function createCallToken(opts: {
	room: string;
	userId: string;
	displayName: string;
}): Promise<string> {
	const token = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
		identity: opts.userId,
		name: opts.displayName,
		ttl: TOKEN_TTL_SECONDS,
	});
	token.addGrant({
		roomJoin: true,
		room: opts.room,
		canPublish: true,
		canPublishSources: [
			TrackSource.MICROPHONE,
			TrackSource.CAMERA,
			TrackSource.SCREEN_SHARE,
			TrackSource.SCREEN_SHARE_AUDIO,
		],
		canSubscribe: true,
		canPublishData: true,
	});
	return await token.toJwt();
}

// Forcibly close the LiveKit room. Used when an admin deletes the voice
// channel — every connected participant receives a Disconnected event and
// the room is freed. Safe to call when no room exists (deleteRoom returns
// successfully if the room is already absent).
export async function deleteRoom(channelId: string): Promise<void> {
	try {
		await roomService().deleteRoom(roomName(channelId));
	} catch (err) {
		log.warn({ channelId, err }, 'deleteRoom failed for');
	}
}

const ROOM_PREFIX = 'voice:';
// TrackSource values from @livekit/protocol. Inlined as literals to avoid
// pulling the enum into the build for two numbers.
const TRACK_SOURCE_MICROPHONE = 2;
const TRACK_SOURCE_SCREEN_SHARE = 3;

export interface ParticipantState {
	identity: string;
	micMuted: boolean;
	deafened: boolean;
	// True while the participant has a published screen-share video track
	// (regardless of dynacast pause state). Lets the sidebar flag who's
	// presenting without the viewer having to be in the channel.
	sharing: boolean;
}

// Structural shape shared by the ParticipantInfo we get from listParticipants()
// and the one embedded in webhook payloads — both carry the same two fields we
// read, so either satisfies this.
export interface ParticipantInfoLike {
	identity: string;
	tracks?: { source?: number; muted?: boolean }[];
	attributes?: Record<string, string>;
}

// Single interpretation of LiveKit's participant shape, so the polled channel
// list and the webhook-driven presence events can never disagree about who is
// muted or presenting.
export function participantStateFrom(p: ParticipantInfoLike): ParticipantState {
	const tracks = p.tracks ?? [];
	const micTrack = tracks.find((t) => t.source === TRACK_SOURCE_MICROPHONE);
	// No mic track at all = effectively muted from a listener's perspective.
	// A track that's explicitly muted is also muted.
	const micMuted = !micTrack || !!micTrack.muted;
	const deafened = p.attributes?.deafened === '1';
	// A published screen-share video track means they're presenting. We
	// deliberately DON'T require it to be unmuted: the client never mutes the
	// screen *video* track (it only mutes screen-share audio, and unpublishes on
	// stop). With dynacast enabled, an unwatched share has no subscribers, so the
	// SFU pauses it and reports the track as muted — checking !muted there would
	// wrongly hide an active share from anyone not currently watching it.
	const sharing = !!tracks.find((t) => t.source === TRACK_SOURCE_SCREEN_SHARE);
	return { identity: p.identity, micMuted, deafened, sharing };
}

/**
 * Collapse `<userId>#screen` sidecars onto the user they belong to.
 *
 * A sidecar is not a participant — it is one user's screen arriving over its
 * own connection. It contributes exactly one thing: `sharing: true`. Everything
 * else about the user (mic, deafened) comes from their real connection.
 *
 * Keyed on the sidecar's published track rather than on its mere existence: it
 * connects a moment before the user confirms the system broadcast sheet, and
 * again for as long as it takes to tear down. Reading existence would flag them
 * as presenting across both windows, and — if they dismissed the sheet —
 * indefinitely.
 *
 * Order is preserved for the real participants, and a sidecar whose owner isn't
 * in the room is dropped rather than promoted: that pairing only exists during
 * the moment between the two connections, and inventing a participant from it
 * would flash a head into the sidebar with no mic state.
 */
export function foldScreenSidecars(states: ParticipantState[]): ParticipantState[] {
	const sharingViaSidecar = new Set<string>();
	let sawSidecar = false;
	for (const s of states) {
		if (!isScreenIdentity(s.identity)) continue;
		sawSidecar = true;
		if (s.sharing) sharingViaSidecar.add(baseIdentity(s.identity));
	}
	// A sidecar that is connected but not yet publishing still has to be
	// stripped from the list, even though it grants nobody a `sharing` flag.
	if (!sawSidecar) return states;
	if (sharingViaSidecar.size === 0) return states;

	return states
		.filter((s) => !isScreenIdentity(s.identity))
		.map((s) => (sharingViaSidecar.has(s.identity) ? { ...s, sharing: true } : s));
}

/**
 * One user's current state in a channel, as LiveKit sees it — including a share
 * published by their sidecar. Used by the webhook path, where a sidecar's
 * join/leave has to be re-expressed as an update to its owner and the owner's
 * mic/deafened flags have to come from somewhere.
 *
 * Returns null when the user isn't connected, which is the normal race on a
 * sidecar that outlives its owner's disconnect.
 */
export async function getParticipantState(
	channelId: string,
	userId: string,
): Promise<ParticipantState | null> {
	let participants: ParticipantInfoLike[];
	try {
		participants = await roomService().listParticipants(roomName(channelId));
	} catch (err) {
		log.warn({ channelId, userId, err }, 'listParticipants failed for participant state');
		return null;
	}
	const folded = foldScreenSidecars(participants.map(participantStateFrom));
	return folded.find((p) => p.identity === userId) ?? null;
}

// `voice:<channelId>` → channelId. Returns null for rooms that aren't voice
// channels (1-to-1 calls use the `dmcall:` prefix), so callers can ignore them.
export function channelIdFromRoom(room: string): string | null {
	return room.startsWith(ROOM_PREFIX) ? room.slice(ROOM_PREFIX.length) : null;
}

// Returns a map of channelId → list of currently-connected participants with
// their per-participant state (mic mute, deafened). LiveKit gives us mic state
// via published TrackInfo; deafened is purely an app concept, so we read it
// from a "deafened" participant attribute the client sets when toggling its
// headphones button. Empty rooms aren't returned by LiveKit, so any channel
// missing from the result is implicitly empty.
export async function listActiveParticipants(channelIds: string[]): Promise<Map<string, ParticipantState[]>> {
	const result = new Map<string, ParticipantState[]>();
	if (channelIds.length === 0) return result;

	const wantedRooms = new Set(channelIds.map(roomName));

	let rooms: Awaited<ReturnType<RoomServiceClient['listRooms']>>;
	try {
		rooms = await roomService().listRooms(Array.from(wantedRooms));
	} catch (err) {
		// LiveKit may be unreachable (e.g. dev without docker up). Don't fail the
		// channel list — degrade gracefully to "no participants reported."
		log.warn({ err }, 'listRooms failed');
		return result;
	}

	const active = rooms.filter((r) => wantedRooms.has(r.name) && r.numParticipants > 0);

	await Promise.all(
		active.map(async (r) => {
			try {
				const participants = await roomService().listParticipants(r.name);
				const channelId = r.name.slice(ROOM_PREFIX.length);
				// Fold here rather than in the callers: this is the one place the
				// whole app learns who is in a channel, so it is also the only
				// place a screen sidecar can leak out of.
				result.set(channelId, foldScreenSidecars(participants.map(participantStateFrom)));
			} catch (err) {
				log.warn({ name: r.name, err }, 'listParticipants failed for');
			}
		}),
	);

	return result;
}
