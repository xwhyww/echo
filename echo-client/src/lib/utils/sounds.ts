// Lightweight UI sounds synthesized with the Web Audio API. We generate tones
// on the fly instead of shipping audio files so there are no binary assets to
// manage and nothing extra to download. A single lazily-created AudioContext is
// shared across every cue; it's resumed on demand (the cues are triggered by
// user actions — clicking call/join — so the autoplay policy is satisfied).

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	if (!ctx) {
		const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctor) return null;
		ctx = new Ctor();
	}
	if (ctx.state === 'suspended') ctx.resume().catch(() => {});
	return ctx;
}

// Play a single tone, scheduled `start` seconds from now, with a short attack/
// release so it doesn't click. `peak` is the gain ceiling (kept low — these are
// notification chirps, not music).
function tone(freq: number, start: number, dur: number, peak = 0.14, type: OscillatorType = 'sine') {
	const c = audioCtx();
	if (!c) return;
	const osc = c.createOscillator();
	const g = c.createGain();
	osc.type = type;
	osc.frequency.value = freq;
	const t0 = c.currentTime + start;
	g.gain.setValueAtTime(0, t0);
	g.gain.linearRampToValueAtTime(peak, t0 + 0.015);
	g.gain.setValueAtTime(peak, t0 + Math.max(0.02, dur - 0.04));
	g.gain.linearRampToValueAtTime(0, t0 + dur);
	osc.connect(g).connect(c.destination);
	osc.start(t0);
	osc.stop(t0 + dur + 0.02);
}

// ─── One-shot cues ──────────────────────────────────────────────

// Rising two-note blip — someone joined the voice channel.
export function playVoiceJoin(): void {
	tone(587.33, 0, 0.12); // D5
	tone(880.0, 0.1, 0.16); // A5
}

// Falling two-note blip — someone left the voice channel.
export function playVoiceLeave(): void {
	tone(740.0, 0, 0.12); // F#5
	tone(440.0, 0.1, 0.18); // A4
}

// ─── Looping ring tones ─────────────────────────────────────────

let incomingTimer: ReturnType<typeof setInterval> | null = null;
let outgoingTimer: ReturnType<typeof setInterval> | null = null;

// Incoming: classic dual-tone telephone "beat" (440 + 480 Hz together) so it
// reads instantly as a ringing phone. Repeats until answered/dismissed.
function incomingBurst() {
	tone(440, 0, 1.0, 0.11);
	tone(480, 0, 1.0, 0.11);
}

export function startIncomingRing(): void {
	stopIncomingRing();
	incomingBurst();
	incomingTimer = setInterval(incomingBurst, 3000);
}

export function stopIncomingRing(): void {
	if (incomingTimer) {
		clearInterval(incomingTimer);
		incomingTimer = null;
	}
}

// Outgoing: a single, softer ringback tone so the caller can tell it apart from
// the incoming ring by ear.
function outgoingBurst() {
	tone(440, 0, 1.0, 0.08);
}

export function startOutgoingRing(): void {
	stopOutgoingRing();
	outgoingBurst();
	outgoingTimer = setInterval(outgoingBurst, 3000);
}

export function stopOutgoingRing(): void {
	if (outgoingTimer) {
		clearInterval(outgoingTimer);
		outgoingTimer = null;
	}
}

export function stopAllRings(): void {
	stopIncomingRing();
	stopOutgoingRing();
}
