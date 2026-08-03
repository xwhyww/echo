/**
 * The microphone capture pipeline's vocabulary. Kept apart from the stages so a
 * stage can be read without the assembly and vice versa.
 */

export interface ProcessingSettings {
	inputDeviceId: string | null;
	noiseSuppression: boolean;
	echoCancellation: boolean;
	autoGainControl: boolean;
	rnnoise: boolean;
	deepFilterNet: boolean;
	vadGate: boolean;
	sensitivityEnabled: boolean;
	sensitivityThresholdDb: number;
	loudnessLimit: boolean;
}

export interface MicCapture {
	// Processed stream, ready to feed MediaRecorder or LiveKit publishTrack.
	stream: MediaStream;
	// The raw mic source node — exposed so callers can attach an AnalyserNode
	// for visualisation without seeing post-RNNoise gating drops.
	source: MediaStreamAudioSourceNode;
	audioCtx: AudioContext;
	// Final gain stage at the end of the chain. Live-adjustable so callers can
	// implement an input-volume slider without rebuilding the pipeline.
	gain: GainNode;
	// Tears down the whole pipeline: stops tracks, disconnects nodes, closes ctx.
	cleanup: () => void;
}

/**
 * One link in the chain: the node audio flows through, and whatever has to be
 * torn down along with it. Every optional stage returns this or `null` — a
 * stage that fails to load is simply left out, never fatal.
 */
export interface AudioStage {
	node: AudioNode;
	destroy?: () => void;
}
