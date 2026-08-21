import { microphoneSettings } from '$lib/stores/microphoneSettings.svelte.js';
import type { MicrophoneSettings } from '$lib/stores/microphoneSettings.svelte.js';
import { voiceVolumes } from '$lib/stores/voiceVolumes.svelte.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';

const DEFAULT_DEVICE = '__default__';

/**
 * Mouth-to-ear delay each option adds when it is on, in milliseconds.
 *
 * These are the stage's own algorithmic cost, not measurements of a particular
 * machine: a worklet that needs N frames before it can emit one holds the
 * signal for N frames no matter how fast the CPU is. The browser's native DSP
 * (suppression, echo cancellation, AGC) runs inside the capture pipeline whose
 * buffer we already pay for, so it is listed at zero and left out of the total.
 *
 *   • rnnoise         — 480-sample (10 ms) frames, one frame of hold.
 *   • deepFilterNet   — 480-sample frames plus the model's own lookahead.
 *   • vadGate         — the model needs a few frames to call speech (~30 ms),
 *                       then `RAMP_OPEN_S` in gate.ts spends 20 ms opening.
 *
 * Keep these in step with `lib/audio/{noiseSuppression,vadGate,gate}.ts`.
 */
const ADDED_LATENCY_MS: Partial<Record<keyof MicrophoneSettings, number>> = {
	rnnoise: 10,
	deepFilterNet: 40,
	vadGate: 50,
};

/**
 * The microphone settings screen: the input-device list (which the browser only
 * names once permission has been granted), the gain and sensitivity controls,
 * and the processing toggles.
 */
export function useAudioSettings() {
	const t = $derived(i18n.t);
	const settings = $derived(microphoneSettings.value);

	let inputs = $state<MediaDeviceInfo[]>([]);
	let inputsError = $state<string | null>(null);
	// enumerateDevices() returns blank labels until permission has been granted
	// at least once, so we can offer a "grant access to see names" hint instead
	// of a dropdown full of anonymous entries.
	let labelsAvailable = $state(false);

	async function loadInputs() {
		if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
			inputsError = t.audio.enumerationUnsupported;
			return;
		}
		try {
			const devices = await navigator.mediaDevices.enumerateDevices();
			const audioIns = devices.filter((d) => d.kind === 'audioinput');
			labelsAvailable = audioIns.some((d) => d.label.length > 0);
			inputs = audioIns;
			inputsError = null;
		} catch (err) {
			console.error('[useAudioSettings] enumerateDevices failed', err);
			inputsError = t.audio.listInputsFailed;
		}
	}

	$effect(() => {
		void loadInputs();
		// Pick up hot-plug / unplug events (a USB headset connected mid-session)
		// so the dropdown stays accurate without a reload.
		const handler = () => void loadInputs();
		navigator.mediaDevices?.addEventListener?.('devicechange', handler);
		return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handler);
	});

	const deviceOptions = $derived([
		{ value: DEFAULT_DEVICE, label: t.audio.systemDefault },
		...inputs.map((d) => ({
			value: d.deviceId,
			label: d.label || t.audio.unnamedMic(d.deviceId.slice(0, 6)),
		})),
	]);

	// The processing chain, in the order it's applied. `satisfies` rather than a
	// type annotation so `key` keeps its literal type and can index the settings.
	const toggles = $derived(
		(
			[
				{ key: 'noiseSuppression', label: t.audio.noiseSuppression, desc: t.audio.noiseSuppressionDesc, badge: t.audio.badges.native },
				{ key: 'echoCancellation', label: t.audio.echoCancellation, desc: t.audio.echoCancellationDesc, badge: t.audio.badges.native },
				{ key: 'autoGainControl', label: t.audio.autoGainControl, desc: t.audio.autoGainControlDesc, badge: t.audio.badges.native },
				{ key: 'loudnessLimit', label: t.audio.loudnessLimit, desc: t.audio.loudnessLimitDesc, badge: undefined },
				{ key: 'rnnoise', label: t.audio.rnnoise, desc: t.audio.rnnoiseDesc, badge: t.audio.badges.beta },
				{ key: 'deepFilterNet', label: t.audio.deepFilterNet, desc: t.audio.deepFilterNetDesc, badge: t.audio.badges.ai },
				{ key: 'vadGate', label: t.audio.vadGate, desc: t.audio.vadGateDesc, badge: t.audio.badges.ai },
			] satisfies { key: keyof MicrophoneSettings; label: string; desc: string; badge: string | undefined }[]
		).map((item) => {
			// The note describes what the option is costing *now*, so it appears
			// only while the stage is actually in the pipeline. An off option costs
			// nothing, and a note on every row would just be noise.
			const cost = isActive(item.key) ? (ADDED_LATENCY_MS[item.key] ?? 0) : 0;
			return { ...item, note: cost > 0 ? t.audio.latencyNote(cost) : undefined };
		}),
	);

	const addedLatencyMs = $derived(
		(Object.keys(ADDED_LATENCY_MS) as (keyof MicrophoneSettings)[])
			.filter(isActive)
			.reduce((sum, key) => sum + (ADDED_LATENCY_MS[key] ?? 0), 0),
	);

	/**
	 * Whether a stage is switched on *and* reaches the pipeline. RNNoise is on
	 * but inert whenever DeepFilterNet is on, because `captureMic` picks one of
	 * the two — charging for both would overstate the delay by exactly the stage
	 * that never runs.
	 */
	function isActive(key: keyof MicrophoneSettings): boolean {
		if (settings[key] !== true) return false;
		if (key === 'rnnoise' && settings.deepFilterNet) return false;
		return true;
	}

	const micGainPercent = $derived(Math.round(voiceVolumes.micGain * 100));

	return {
		get settings() { return settings; },
		get deviceOptions() { return deviceOptions; },
		get selectedDevice() { return settings.inputDeviceId ?? DEFAULT_DEVICE; },
		get labelsHidden() { return !labelsAvailable && inputs.length > 0; },
		get inputsError() { return inputsError; },
		get toggles() { return toggles; },
		get addedLatencyMs() { return addedLatencyMs; },
		get micGain() { return voiceVolumes.micGain; },
		get micGainPercent() { return micGainPercent; },

		refreshInputs: loadInputs,
		pickDevice(value: string) {
			microphoneSettings.set('inputDeviceId', value === DEFAULT_DEVICE ? null : value);
		},
		isOn(key: keyof typeof settings) { return settings[key] === true; },
		toggle(key: keyof typeof settings) {
			const current = settings[key];
			// Boolean switches only — the device id and the numeric fields have
			// their own controls and must not come through here.
			if (typeof current !== 'boolean') return;
			microphoneSettings.set(key, !current as never);
		},
		setMicGain(v: number) { voiceVolumes.setMicGain(v); },
		resetMicGain() { voiceVolumes.setMicGain(1); },
		setSensitivity(v: number) { microphoneSettings.set('sensitivityThresholdDb', v); },

		/** One-shot capture purely to make the browser reveal device labels. */
		async grantAccess() {
			try {
				const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
				stream.getTracks().forEach((track) => track.stop());
				await loadInputs();
			} catch (err) {
				console.warn('[useAudioSettings] mic permission denied', err);
			}
		},
	};
}
