import { AudioPresets, type RoomOptions } from 'livekit-client';

/**
 * The `Room` options shared by the voice-channel client and the 1:1 call
 * client. Both carry the same kind of audio and should not drift apart by
 * accident.
 *
 * The point of spelling `publishDefaults` out is that LiveKit's own defaults
 * move between releases, and audio defaults are exactly the sort that change
 * how much delay a user hears without a single line in this repo changing.
 * Everything here is a decision, not a copy of the current SDK values:
 *
 *   • `dtx: false` — the SDK enables discontinuous transmission for mono
 *     tracks, so the encoder stops sending during silence and the receiver's
 *     jitter buffer has to spin back up on every utterance. That lands as a
 *     clipped first syllable, which is the same complaint the VAD gate causes.
 *     Echo already offers a VAD gate to anyone who wants silence suppressed;
 *     paying for it a second time in the codec buys nothing and costs onset.
 *   • `red: true` — redundant encoding, which is also the SDK default. It costs
 *     bandwidth rather than delay, and it is what keeps speech intelligible
 *     through packet loss on a bad link. Pinned so a future default can't drop
 *     it silently.
 *   • `audioPreset: AudioPresets.music` — 48 kbit/s. Also today's SDK default;
 *     named so the bitrate is a choice made here rather than a version detail.
 *
 * Video is deliberately left to the SDK: the only video Echo publishes is a
 * screen share, and `screenShare.svelte.ts` sets its encoding at publish time.
 * `publishDefaults` is merged over the SDK's, so the keys absent here keep
 * their stock values.
 */
export const ROOM_OPTIONS: RoomOptions = {
	adaptiveStream: true,
	dynacast: true,
	publishDefaults: {
		dtx: false,
		red: true,
		audioPreset: AudioPresets.music,
	},
};
