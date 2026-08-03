import { ConnectionQuality } from 'livekit-client';
import type { Dict } from '$lib/i18n/en.js';

export type QualityTone = 'good' | 'warn' | 'bad' | 'unknown';

export interface QualityMeta {
	tone: QualityTone;
	/** How many of the three strength bars are lit. */
	bars: number;
	label: string;
	/** The latency readout's colour; the bars are painted from `tone` in CSS. */
	textClass: string;
}

/**
 * Everything the indicator shows about one connection-quality bucket.
 *
 * LiveKit gives us a coarse bucket and nothing else, and the component used to
 * `switch` over it three times — once for the tone, once for the bar count,
 * once for the label — which is three places to forget a case when a bucket is
 * added.
 */
export function qualityMeta(quality: ConnectionQuality | null, t: Dict): QualityMeta {
	switch (quality) {
		case ConnectionQuality.Excellent:
			return { tone: 'good', bars: 3, label: t.voice.quality.excellent, textClass: 'text-muted' };
		case ConnectionQuality.Good:
			return { tone: 'good', bars: 2, label: t.voice.quality.good, textClass: 'text-muted' };
		case ConnectionQuality.Poor:
			return { tone: 'warn', bars: 1, label: t.voice.quality.poor, textClass: 'text-warning' };
		case ConnectionQuality.Lost:
			return { tone: 'bad', bars: 0, label: t.voice.quality.lost, textClass: 'text-error' };
		default:
			// Still measuring: the readout keeps the wrapper's own faint colour.
			return { tone: 'unknown', bars: 0, label: t.voice.quality.measuring, textClass: 'text-faint' };
	}
}
