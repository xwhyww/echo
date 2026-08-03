// Per-identity volume preferences for voice channels.
//
// • micGain — local input gain applied to your published mic stream (1.0 = passthrough).
// • remoteVolumes[identity] — output gain applied to a specific remote
//   participant's mic audio for *you only* (1.0 = original loudness).
// • screenShareVolumes[identity] — output gain applied to a specific remote
//   participant's screen-share audio for *you only*. Kept separate from
//   remoteVolumes so lowering someone's voice doesn't also drop the audio
//   of the video they're sharing.
//
// Persisted in localStorage so a user who'd boosted Alice's mic doesn't have
// to redo it on every reload. Listeners notify voiceClient so changes apply
// live to the running audio graph.

const STORAGE_KEY = 'echo:voiceVolumes';

export const VOICE_VOLUME_MIN = 0;
export const VOICE_VOLUME_MAX = 2; // 0–200%

interface Persisted {
	micGain: number;
	remoteVolumes: Record<string, number>;
	screenShareVolumes: Record<string, number>;
}

function clamp(n: number): number {
	if (!Number.isFinite(n)) return 1;
	return Math.max(VOICE_VOLUME_MIN, Math.min(VOICE_VOLUME_MAX, n));
}

function read(): Persisted {
	const empty: Persisted = { micGain: 1, remoteVolumes: {}, screenShareVolumes: {} };
	if (typeof localStorage === 'undefined') return empty;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return empty;
		const v = JSON.parse(raw);
		const remote: Record<string, number> = {};
		if (v?.remoteVolumes && typeof v.remoteVolumes === 'object') {
			for (const [id, val] of Object.entries(v.remoteVolumes)) {
				if (typeof val === 'number') remote[id] = clamp(val);
			}
		}
		const screen: Record<string, number> = {};
		if (v?.screenShareVolumes && typeof v.screenShareVolumes === 'object') {
			for (const [id, val] of Object.entries(v.screenShareVolumes)) {
				if (typeof val === 'number') screen[id] = clamp(val);
			}
		}
		return {
			micGain: typeof v?.micGain === 'number' ? clamp(v.micGain) : 1,
			remoteVolumes: remote,
			screenShareVolumes: screen,
		};
	} catch {
		return empty;
	}
}

let micGain = $state<number>(1);
let remoteVolumes = $state<Record<string, number>>({});
let screenShareVolumes = $state<Record<string, number>>({});

const initial = read();
micGain = initial.micGain;
remoteVolumes = initial.remoteVolumes;
screenShareVolumes = initial.screenShareVolumes;

const listeners = new Set<() => void>();

function persist() {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ micGain, remoteVolumes, screenShareVolumes }),
		);
	} catch {
		// quota / private mode — ignore
	}
}

function notify() {
	for (const fn of listeners) fn();
}

export const voiceVolumes = {
	get micGain() {
		return micGain;
	},
	getRemoteVolume(identity: string): number {
		const v = remoteVolumes[identity];
		return typeof v === 'number' ? v : 1;
	},
	setMicGain(n: number) {
		micGain = clamp(n);
		persist();
		notify();
	},
	setRemoteVolume(identity: string, n: number) {
		remoteVolumes = { ...remoteVolumes, [identity]: clamp(n) };
		persist();
		notify();
	},
	getScreenShareVolume(identity: string): number {
		const v = screenShareVolumes[identity];
		return typeof v === 'number' ? v : 1;
	},
	setScreenShareVolume(identity: string, n: number) {
		screenShareVolumes = { ...screenShareVolumes, [identity]: clamp(n) };
		persist();
		notify();
	},
	subscribe(fn: () => void): () => void {
		listeners.add(fn);
		return () => listeners.delete(fn);
	},
};
