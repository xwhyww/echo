import { ConnectionQuality, type Room } from 'livekit-client';

// Connection-quality readouts for the voice call in progress.
//
// LiveKit hands us a coarse quality bucket for free; the numbers behind it
// (RTT / loss% / jitter) come from polling RTCPeerConnection.getStats() every
// few seconds and diffing against the previous sample. Kept apart from
// `voiceClient` because none of it affects the call — it only describes it.

const POLL_INTERVAL_MS = 3000;

/** ICE transport of the nominated pair: 'udp' | 'tcp' (or 'ssltcp'/'tls'). */
export type IceTransport = string;
/** ICE candidate type: 'host' | 'srflx' | 'prflx' | 'relay'. */
export type IceCandidateType = string;

let quality = $state<ConnectionQuality>(ConnectionQuality.Unknown);
let latencyMs = $state<number | null>(null);
let packetLossPercent = $state<number | null>(null);
let jitterMs = $state<number | null>(null);
let transport = $state<IceTransport | null>(null);
let candidateType = $state<IceCandidateType | null>(null);

let timer: ReturnType<typeof setInterval> | null = null;
/** Cumulative counters from the last sample, used to compute deltas. */
let lastSample: { packetsSent: number; packetsLost: number } | null = null;

function getPublisherPC(r: Room): RTCPeerConnection | null {
	// livekit-client doesn't publish the underlying RTCPeerConnection on its
	// typed API, so we reach into the engine. Guarded so a future internal
	// rename just disables this indicator instead of crashing.
	const engine = (
		r as unknown as { engine?: { pcManager?: { publisher?: { pc?: RTCPeerConnection } } } }
	).engine;
	return engine?.pcManager?.publisher?.pc ?? null;
}

async function sample(r: Room): Promise<void> {
	const pc = getPublisherPC(r);
	if (!pc) return;

	let report: RTCStatsReport;
	try {
		report = await pc.getStats();
	} catch {
		return;
	}

	let rttSec: number | null = null;
	let localCandidateId: string | null = null;
	let packetsSent = 0;
	let packetsLost = 0;
	let jitterSum = 0;
	let jitterCount = 0;

	report.forEach((stat: any) => {
		if (stat.type === 'candidate-pair' && stat.state === 'succeeded' && stat.nominated) {
			if (typeof stat.currentRoundTripTime === 'number') rttSec = stat.currentRoundTripTime;
			// Which candidate won matters as much as the number beside it: a pair
			// that fell back to LiveKit's TCP port reads far higher than the path
			// really is, because the RTT is measured over TCP-wrapped STUN and
			// carries Nagle and retransmits with it. Without this the readout
			// cannot tell a slow network from a blocked UDP range.
			if (typeof stat.localCandidateId === 'string') localCandidateId = stat.localCandidateId;
		}
		// Outbound: how many audio packets we sent. Loss is reported back to us
		// via remote-inbound-rtp — the receiver tells us what they missed.
		if (stat.type === 'outbound-rtp' && stat.kind === 'audio') {
			if (typeof stat.packetsSent === 'number') packetsSent += stat.packetsSent;
		}
		if (stat.type === 'remote-inbound-rtp' && stat.kind === 'audio') {
			if (typeof stat.packetsLost === 'number') packetsLost += stat.packetsLost;
			if (typeof stat.jitter === 'number') {
				jitterSum += stat.jitter;
				jitterCount += 1;
			}
		}
	});

	if (rttSec !== null) latencyMs = Math.round(rttSec * 1000);

	if (localCandidateId) {
		// `relayProtocol` is set only on relay candidates and names the transport
		// to the TURN server, which is the one that actually costs latency there.
		const local = report.get(localCandidateId) as any;
		if (local) {
			transport = local.relayProtocol ?? local.protocol ?? null;
			candidateType = local.candidateType ?? null;
		}
	}

	if (jitterCount > 0) jitterMs = Math.round((jitterSum / jitterCount) * 1000);

	if (lastSample) {
		const deltaSent = packetsSent - lastSample.packetsSent;
		const deltaLost = Math.max(0, packetsLost - lastSample.packetsLost);
		const total = deltaSent + deltaLost;
		// One decimal place — anything finer is noise on a 3s sample.
		if (total > 0) packetLossPercent = Math.round((deltaLost / total) * 1000) / 10;
	}
	lastSample = { packetsSent, packetsLost };
}

export const voiceStats = {
	get quality() { return quality; },
	/** LiveKit's own bucket, pushed in from its ConnectionQualityChanged event. */
	set quality(v: ConnectionQuality) { quality = v; },
	get latencyMs() { return latencyMs; },
	get packetLossPercent() { return packetLossPercent; },
	get jitterMs() { return jitterMs; },
	get transport() { return transport; },
	get candidateType() { return candidateType; },

	start(r: Room): void {
		voiceStats.stop();
		lastSample = null;
		timer = setInterval(() => void sample(r), POLL_INTERVAL_MS);
		// Kick off an immediate sample so the indicator isn't blank for three
		// seconds after joining. The first one only seeds `lastSample`; loss%
		// appears on the second tick.
		void sample(r);
	},

	stop(): void {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
		lastSample = null;
		latencyMs = null;
		packetLossPercent = null;
		jitterMs = null;
		transport = null;
		candidateType = null;
		quality = ConnectionQuality.Unknown;
	},
};
