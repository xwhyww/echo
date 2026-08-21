import { voiceVolumes } from '$lib/stores/voiceVolumes.svelte.js';

/**
 * Playback of everyone else's audio in a voice channel, at the volume the
 * listener chose for each of them.
 *
 * Why this is more than `track.attach()`:
 *
 *   • Chromium's WebRTC stack only decodes a remote track while an
 *     HTMLMediaElement is "consuming" it. Without the element, a bare
 *     MediaStreamSource produces silence.
 *   • But `createMediaElementSource` taps the element's *post-mute* output, so
 *     muting the element would silence the WebAudio path too — and per-user
 *     volume with it.
 *
 * So each track gets an element that stays permanently muted (it exists only to
 * keep the decoder running) plus a MediaStreamSource on the raw track feeding a
 * GainNode. That gain is the volume slider.
 */

/** Just enough of a LiveKit audio track — keeps this module out of the SDK. */
export interface RemoteAudioTrack {
	mediaStreamTrack: MediaStreamTrack;
	attach(): HTMLMediaElement;
}

interface Node {
	mediaTrack: MediaStreamTrack;
	el: HTMLMediaElement;
	source: MediaStreamAudioSourceNode;
	gain: GainNode;
	/**
	 * Screen-share audio has its own slider per share, so the gain pipeline has
	 * to know which bucket to read on every re-apply.
	 */
	isScreenShare: boolean;
}

let ctx: AudioContext | null = null;
let nodes = new Map<string, Node[]>();
let deafened = false;

function ensureCtx(): AudioContext {
	if (ctx && ctx.state !== 'closed') {
		// A new AudioContext often starts suspended and only resumes after a user
		// gesture. Joining was a click, so resume() succeeds; we call it on every
		// subscription in case the browser suspended us again (backgrounded tab).
		if (ctx.state === 'suspended') ctx.resume().catch(() => {});
		return ctx;
	}
	const Ctx =
		window.AudioContext ||
		(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
	// Playback rides on top of the WebRTC jitter buffer, so whatever this
	// context buffers is added to the delay a listener actually hears. Ask for
	// the smallest buffer the platform will give us.
	ctx = new Ctx({ latencyHint: 'interactive' });
	if (ctx.state === 'suspended') ctx.resume().catch(() => {});
	return ctx;
}

function targetGain(identity: string, isScreenShare: boolean): number {
	if (deafened) return 0;
	return isScreenShare
		? voiceVolumes.getScreenShareVolume(identity)
		: voiceVolumes.getRemoteVolume(identity);
}

function applyTo(identity: string) {
	const list = nodes.get(identity);
	if (!list) return;
	for (const n of list) {
		n.gain.gain.value = targetGain(identity, n.isScreenShare);
		// `el.muted` stays true — native playback is permanently suppressed so
		// WebAudio is the only path. Deafening also pauses the element: that stops
		// the decoder, which silences the WebAudio path without depending on gain
		// ramps or browser quirks.
		if (deafened) {
			try { n.el.pause(); } catch {}
		} else if (n.el.paused) {
			n.el.play().catch(() => {});
		}
	}
}

function dispose(n: Node) {
	try { n.source.disconnect(); } catch {}
	try { n.gain.disconnect(); } catch {}
	try { n.el.remove(); } catch {}
}

export const remoteAudio = {
	get deafened() { return deafened; },

	setDeafened(v: boolean) {
		deafened = v;
		remoteAudio.applyAll();
	},

	/** Re-read every volume — after a settings change, or on undeafen. */
	applyAll() {
		for (const identity of nodes.keys()) applyTo(identity);
	},

	/** Wire one newly subscribed track into the graph. Never throws. */
	add(identity: string, track: RemoteAudioTrack, isScreenShare: boolean) {
		try {
			const el = track.attach();
			el.style.display = 'none';
			el.autoplay = !deafened;
			el.muted = true;
			document.body.appendChild(el);

			const audioCtx = ensureCtx();
			// MediaStreamSource, not MediaElementSource: the latter is muted in
			// lockstep with the element, which would zero the gain path.
			const source = audioCtx.createMediaStreamSource(
				new MediaStream([track.mediaStreamTrack]),
			);
			const gain = audioCtx.createGain();
			gain.gain.value = targetGain(identity, isScreenShare);
			source.connect(gain).connect(audioCtx.destination);

			// Start playback only when not deafened; leaving the element paused
			// keeps the decoder dormant until `setDeafened(false)` resumes it.
			// The catch is required — play() rejects on autoplay-blocked tabs.
			if (!deafened) {
				el.play().catch((err) => {
					console.warn('[remoteAudio] el.play() rejected:', err);
				});
			}

			nodes.set(identity, [
				...(nodes.get(identity) ?? []),
				{ mediaTrack: track.mediaStreamTrack, el, source, gain, isScreenShare },
			]);
		} catch (err) {
			console.warn('[remoteAudio] failed to wire remote audio gain:', err);
		}
	},

	/** Unwire one track; the identity's entry goes when its last track does. */
	remove(identity: string, mediaTrack: MediaStreamTrack) {
		const list = nodes.get(identity);
		if (!list) return;
		const remaining = list.filter((n) => {
			if (n.mediaTrack !== mediaTrack) return true;
			dispose(n);
			return false;
		});
		if (remaining.length === 0) nodes.delete(identity);
		else nodes.set(identity, remaining);
	},

	/** Leaving the channel: drop every node and close the context. */
	teardown() {
		for (const list of nodes.values()) for (const n of list) dispose(n);
		nodes.clear();
		if (ctx) {
			const closing = ctx;
			ctx = null;
			closing.close().catch(() => {});
		}
	},
};
