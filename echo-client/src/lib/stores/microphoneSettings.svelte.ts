// Per-device microphone preferences. Stored in localStorage rather than the
// server because audio processing is hardware-specific — what works on a
// laptop mic differs from a headset, and these don't need to roam across
// machines.

const STORAGE_KEY = 'echo:micSettings';

export interface MicrophoneSettings {
	// Selected input device (`MediaDeviceInfo.deviceId`). Null = system default.
	// We never store the device label — labels are user-personal and may change
	// across browser updates; the id is stable enough for our purposes and
	// gracefully falls back to default when the device is unplugged.
	inputDeviceId: string | null;
	// Browser-native WebRTC DSP. Cheap, runs in the OS audio pipeline.
	noiseSuppression: boolean;
	echoCancellation: boolean;
	autoGainControl: boolean;
	// Heavier WASM-based suppression (RNNoise). Loaded dynamically so disabling
	// it keeps the WASM blob out of the bundle. Wins when native suppression
	// isn't enough — e.g. mechanical-keyboard / fan noise.
	rnnoise: boolean;
	// DeepFilterNet 3 — deep-learning suppression that handles non-stationary
	// noise (keyboards, clicks, distant chatter) much more aggressively than
	// RNNoise. Heavier (~5MB WASM/ONNX, more CPU) and supersedes RNNoise when
	// enabled. Loaded dynamically.
	deepFilterNet: boolean;
	// Silero-VAD voice activity gate. Mutes the published track when no speech
	// is detected, so anything between words (typing, mouse, breath) is fully
	// silent regardless of how the suppression handles it. Loaded dynamically.
	vadGate: boolean;
	// Manual noise gate ("microphone sensitivity"). Audio quieter than
	// `sensitivityThreshold` (dBFS) is muted. Simpler and lower-latency than
	// VAD — useful as a complement (VAD catches "is this voice?" while the
	// sensitivity gate catches "is it loud enough to bother sending?") or as a
	// standalone option for users who dislike VAD's ~30ms onset delay.
	sensitivityEnabled: boolean;
	sensitivityThresholdDb: number;
	// Soft limiter: clamps peaks above ~-10 dBFS using a DynamicsCompressorNode.
	// Stops shouts / breath pops from clipping without compressing normal
	// speech. Different from autoGainControl, which boosts quiet input — this
	// only attenuates loud spikes.
	loudnessLimit: boolean;
}

const defaults: MicrophoneSettings = {
	inputDeviceId: null,
	noiseSuppression: true,
	echoCancellation: true,
	autoGainControl: true,
	rnnoise: false,
	deepFilterNet: false,
	vadGate: false,
	sensitivityEnabled: false,
	sensitivityThresholdDb: -45,
	loudnessLimit: true,
};

function read(): MicrophoneSettings {
	if (typeof localStorage === 'undefined') return { ...defaults };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...defaults };
		const parsed = JSON.parse(raw);
		return {
			inputDeviceId:
				typeof parsed?.inputDeviceId === 'string' && parsed.inputDeviceId.length > 0
					? parsed.inputDeviceId
					: defaults.inputDeviceId,
			noiseSuppression: parsed?.noiseSuppression ?? defaults.noiseSuppression,
			echoCancellation: parsed?.echoCancellation ?? defaults.echoCancellation,
			autoGainControl: parsed?.autoGainControl ?? defaults.autoGainControl,
			rnnoise: parsed?.rnnoise ?? defaults.rnnoise,
			deepFilterNet: parsed?.deepFilterNet ?? defaults.deepFilterNet,
			vadGate: parsed?.vadGate ?? defaults.vadGate,
			sensitivityEnabled: parsed?.sensitivityEnabled ?? defaults.sensitivityEnabled,
			sensitivityThresholdDb:
				typeof parsed?.sensitivityThresholdDb === 'number'
					? Math.max(-80, Math.min(0, parsed.sensitivityThresholdDb))
					: defaults.sensitivityThresholdDb,
			loudnessLimit: parsed?.loudnessLimit ?? defaults.loudnessLimit,
		};
	} catch {
		return { ...defaults };
	}
}

let settings = $state<MicrophoneSettings>(read());

function persist() {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// quota / private mode — ignore, settings stay in-memory for this session
	}
}

function set<K extends keyof MicrophoneSettings>(key: K, value: MicrophoneSettings[K]) {
	settings = { ...settings, [key]: value };
	persist();
}

// Snapshot for non-reactive consumers (e.g. the recorder).
export function getMicrophoneSettings(): MicrophoneSettings {
	return { ...settings };
}

export const microphoneSettings = {
	get value() {
		return settings;
	},
	set,
};
