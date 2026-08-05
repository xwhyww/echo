import { Track, type Room } from 'livekit-client';
import type { PluginListener } from '@tauri-apps/api/core';
import { voiceService } from '$lib/api/voiceService.js';
import {
	isNativeScreenShareSupported,
	onNativeScreenShareEnded,
	setNativeScreenShareAudioMuted,
	startNativeScreenShare,
	stopNativeScreenShare,
} from './iosScreenShare.js';

// Hint passed to navigator.mediaDevices.getDisplayMedia to bias the OS picker.
// The native picker is non-skippable — these values just bias which tab is
// pre-selected. The user can still pick anything once the picker is open.
export type ScreenShareSurface = 'monitor' | 'window' | 'browser';

/**
 * Presenting a screen into a voice channel.
 *
 * Separate from the client that owns the call because it owns something the
 * call doesn't: two `MediaStreamTrack`s that are ours, not LiveKit's. We create
 * them, so we stop them — on disconnect, and when the browser's own "Stop
 * sharing" bar ends the capture behind our back.
 *
 * The room is reached through a getter rather than held: it is replaced on every
 * connect, and a share started against a stale one would publish into nothing.
 *
 * Two mechanisms sit behind one interface. Everywhere with `getDisplayMedia` —
 * browsers, desktop Tauri — the capture is ours and we publish it into the room
 * above. iOS has no such API: the screen arrives through a ReplayKit broadcast
 * extension that only native code can read, so a second native LiveKit
 * connection publishes it and this module merely drives it. Callers never learn
 * which one ran; only `teardown` and `setAudioMuted` need to know, and they read
 * `native` to find out.
 */
export function createScreenShare(deps: {
	room: () => Room | null;
	/** Which channel we're in — the native path needs it to mint its own token. */
	channelId: () => string | null;
	/** Tell the rest of the group that we started or stopped presenting. */
	announce: (sharing: boolean) => void;
}) {
	let isSharing = $state(false);
	let isAudioMuted = $state(false);
	let videoTrack: MediaStreamTrack | null = null;
	let audioTrack: MediaStreamTrack | null = null;
	// Set for the lifetime of a native share. Also the flag teardown reads to
	// decide which of the two mechanisms it is unwinding.
	let native = false;
	let unlistenEnded: PluginListener | null = null;

	/**
	 * The native counterpart of the "Stop sharing" bar: the user ended the
	 * broadcast from Control Center, or iOS killed the extension. Unwind to the
	 * same place the button would have.
	 */
	async function watchNativeEnd(): Promise<void> {
		void unlistenEnded?.unregister();
		unlistenEnded = await onNativeScreenShareEnded(() => {
			void teardown();
		});
	}

	async function teardown(opts: { silent?: boolean } = {}): Promise<void> {
		if (!isSharing && !videoTrack && !audioTrack && !native) return;

		if (native) {
			void unlistenEnded?.unregister();
			unlistenEnded = null;
			native = false;
			try {
				// Disconnects the sidecar, which unpublishes as a side effect —
				// there is nothing in our own room to clean up.
				await stopNativeScreenShare();
			} catch (err) {
				console.warn('[screenShare] native stop failed:', err);
			}
			isSharing = false;
			isAudioMuted = false;
			if (!opts.silent) deps.announce(false);
			return;
		}

		const room = deps.room();
		if (room) {
			try {
				for (const source of [Track.Source.ScreenShare, Track.Source.ScreenShareAudio]) {
					const pub = room.localParticipant.getTrackPublication(source);
					if (pub?.track) await room.localParticipant.unpublishTrack(pub.track);
				}
			} catch (err) {
				console.warn('[screenShare] unpublish failed:', err);
			}
		}
		try { videoTrack?.stop(); } catch {}
		try { audioTrack?.stop(); } catch {}
		videoTrack = null;
		audioTrack = null;
		isSharing = false;
		isAudioMuted = false;
		// Let other group members' sidebars clear the "sharing" flag in real time.
		// Skipped (silent) during disconnect, where a 'left' event follows anyway.
		if (!opts.silent) deps.announce(false);
	}

	/**
	 * iOS: hand off to the native sidecar. The system broadcast sheet is raised
	 * by the plugin, so there is no picker to bias and `surface` is ignored —
	 * ScreenSharePopup already offers a single choice there.
	 */
	async function startNative(): Promise<void> {
		const channelId = deps.channelId();
		if (!channelId) throw new Error('not connected to a voice channel');

		const { url, token } = await voiceService.screenToken(channelId);

		// Arm the end-of-broadcast listener before starting: iOS can deliver the
		// stop immediately if the extension fails to launch, and a listener
		// attached afterwards would miss it and strand `isSharing` at true.
		await watchNativeEnd();
		try {
			await startNativeScreenShare(url, token);
		} catch (err) {
			void unlistenEnded?.unregister();
			unlistenEnded = null;
			// Dismissing the system sheet is a no-op, exactly as dismissing the
			// browser's picker is on the web path.
			if ((err as Error)?.message === 'cancelled') return;
			throw err;
		}

		native = true;
		isSharing = true;
		isAudioMuted = false;
		deps.announce(true);
	}

	async function start(opts: { surface?: ScreenShareSurface; audio?: boolean } = {}): Promise<void> {
		if (!deps.room()) throw new Error('not connected to a voice channel');

		if (await isNativeScreenShareSupported()) {
			// Replacing a native share means tearing the old sidecar down first:
			// unlike the web path there is no picker to cancel out of, so there is
			// no window where we could be left un-shared by mistake.
			if (isSharing) await teardown({ silent: true });
			return await startNative();
		}

		const videoConstraints: MediaTrackConstraints = opts.surface
			? { displaySurface: opts.surface }
			: {};
		const constraints: DisplayMediaStreamOptions = {
			video: Object.keys(videoConstraints).length > 0 ? videoConstraints : true,
			audio: opts.audio ?? true,
		};

		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getDisplayMedia(constraints);
		} catch (err) {
			// User dismissed the native picker — not an error, just a no-op.
			// Importantly, we haven't touched any existing share yet, so they
			// stay sharing whatever they were sharing before.
			const name = (err as Error)?.name;
			if (name === 'NotAllowedError' || name === 'AbortError') return;
			throw err;
		}

		const video = stream.getVideoTracks()[0] ?? null;
		const audio = stream.getAudioTracks()[0] ?? null;
		if (!video) {
			stream.getTracks().forEach((t) => t.stop());
			throw new Error('no video track from display capture');
		}

		// The browser exposes a "Stop sharing" bar that calls .stop() on the
		// track. Listen for that so our state and LiveKit pub stay in sync
		// without requiring the user to also click our button.
		video.addEventListener('ended', () => {
			void teardown();
		});

		// Only now that we have the new tracks in hand do we drop the old
		// publication. Doing it earlier would leave the user un-shared if they
		// cancelled the picker.
		if (isSharing) await teardown();

		// Disconnect could have happened while the picker was open. Bail
		// cleanly in that case.
		const room = deps.room();
		if (!room) {
			video.stop();
			audio?.stop();
			return;
		}

		try {
			await room.localParticipant.publishTrack(video, { source: Track.Source.ScreenShare });
			if (audio) {
				await room.localParticipant.publishTrack(audio, { source: Track.Source.ScreenShareAudio });
			}
		} catch (err) {
			video.stop();
			audio?.stop();
			throw err;
		}

		videoTrack = video;
		audioTrack = audio;
		isSharing = true;
		// Announce so other members' sidebars flag us as presenting right away,
		// rather than waiting on the 30s list-endpoint backstop.
		deps.announce(true);
	}

	async function setAudioMuted(muted: boolean): Promise<void> {
		// The native share's audio belongs to the sidecar's publication, which
		// our own room has no handle on — the plugin mutes it there.
		if (native) {
			try {
				await setNativeScreenShareAudioMuted(muted);
				isAudioMuted = muted;
			} catch (err) {
				console.error('[screenShare] native setAudioMuted failed:', err);
			}
			return;
		}

		const room = deps.room();
		if (!room || !audioTrack) return;
		try {
			// Mute through the LiveKit publication when available — that propagates
			// a TrackMuted event so watchers' UIs update. Fall back to flipping
			// the raw MediaStreamTrack if for some reason the publication isn't
			// indexed yet (e.g. mid-publish).
			const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
			if (pub?.track) {
				if (muted) await pub.track.mute();
				else await pub.track.unmute();
			} else {
				audioTrack.enabled = !muted;
			}
			isAudioMuted = muted;
		} catch (err) {
			console.error('[screenShare] setAudioMuted failed:', err);
		}
	}

	return {
		get isSharing() { return isSharing; },
		get isAudioMuted() { return isAudioMuted; },
		start,
		stop: () => teardown(),
		/** Disconnect path: stop the tracks without announcing it separately. */
		teardown,
		setAudioMuted,
		toggleAudioMuted: () => setAudioMuted(!isAudioMuted),
	};
}
