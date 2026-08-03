import { Track, type Room } from 'livekit-client';
import { remoteAudio } from '$lib/audio/remoteAudio.js';

// Persisted across reloads + channel switches. Without this, every successful
// connect() would reset both flags to false, surprising the user who'd just
// muted themselves a moment earlier.
const STORAGE_KEY = 'echo:voiceClient:audioState';

interface AudioState {
	muted: boolean;
	deafened: boolean;
}

function load(): AudioState {
	if (typeof localStorage === 'undefined') return { muted: false, deafened: false };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { muted: false, deafened: false };
		const v = JSON.parse(raw);
		return { muted: !!v.muted, deafened: !!v.deafened };
	} catch {
		return { muted: false, deafened: false };
	}
}

function save(state: AudioState) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// localStorage can throw in private mode or when the quota is exhausted.
		// Persistence is best-effort; runtime state still works.
	}
}

/**
 * Muted and deafened: two flags that outlive every room they are applied to.
 *
 * They belong to the person, not to the call — which is why they survive a
 * reload and a channel switch, and why the awkward part of this is `restore`:
 * a fresh room starts with a live mic and an audio graph that has never heard
 * of any of it, so both flags have to be pushed onto it explicitly at join.
 * Forgetting either one is audible — someone who joined deafened would hear
 * everybody.
 */
export function createVoiceAudioState(deps: {
	room: () => Room | null;
	micTrack: () => MediaStreamTrack | null;
	/** The flags changed: re-read the roster and tell the rest of the group. */
	onChange: () => void;
}) {
	const initial = load();
	let muted = $state(initial.muted);
	let deafened = $state(initial.deafened);

	function persist() {
		save({ muted, deafened });
	}

	/**
	 * Through the LiveKit publication when there is one — that propagates the
	 * state to everyone else — and by flipping the raw track when there isn't,
	 * which happens in the window before the publication is indexed.
	 *
	 * The track and its processing chain stay alive while muted, so unmuting is
	 * instant: no WASM reload, no AudioContext rebuild.
	 */
	async function applyMute(room: Room, next: boolean): Promise<void> {
		const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
		if (pub?.track) {
			if (next) await pub.track.mute();
			else await pub.track.unmute();
			return;
		}
		const track = deps.micTrack();
		if (track) track.enabled = !next;
	}

	/**
	 * Announced as a participant attribute, because unlike mic mute — which
	 * travels as a track-mute event — deafening is purely local and would
	 * otherwise be invisible to everyone else.
	 */
	function pushDeafenedAttribute(room: Room) {
		room.localParticipant.setAttributes({ deafened: deafened ? '1' : '' }).catch((err) => {
			console.warn('[voiceAudioState] setAttributes(deafened) failed:', err);
		});
	}

	async function setMuted(next: boolean): Promise<void> {
		const room = deps.room();
		if (!room || !deps.micTrack()) return;
		try {
			await applyMute(room, next);
			muted = next;
			persist();
			deps.onChange();
		} catch (err) {
			console.error('[voiceAudioState] setMuted failed:', err);
		}
	}

	function setDeafened(next: boolean): void {
		const room = deps.room();
		if (!room) return;
		deafened = next;
		persist();
		// Drops every remote gain to zero, or restores each person's preferred
		// volume. Cheaper than toggling `.muted` on N media elements, and tracks
		// subscribed later pick the state up on their way in.
		remoteAudio.setDeafened(next);
		pushDeafenedAttribute(room);
		// Deafening also mutes own mic, like Discord. Exactly one of these two
		// paths announces the change: `setMuted` reports both flags at once.
		if (next && !muted) void setMuted(true);
		else deps.onChange();
	}

	return {
		get muted() { return muted; },
		get deafened() { return deafened; },
		setMuted,
		toggleMuted: () => setMuted(!muted),
		setDeafened,
		toggleDeafened: () => setDeafened(!deafened),

		/**
		 * Carries both flags onto a room that has just connected. Failures are
		 * logged rather than thrown: a restored preference not taking is worth a
		 * warning, not a failed join.
		 */
		async restore(room: Room): Promise<void> {
			if (muted) {
				await applyMute(room, true).catch((err) => {
					console.warn('[voiceAudioState] restore mic mute failed:', err);
				});
			}
			// Before anyone's track arrives — the audio graph's own flag starts
			// at false, and a late push would let one person through.
			remoteAudio.setDeafened(deafened);
			if (deafened) pushDeafenedAttribute(room);
		},
	};
}
