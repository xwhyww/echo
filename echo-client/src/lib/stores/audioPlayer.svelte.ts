import { resolveUrl, blobCrossOrigin } from '$lib/api/client.js';
import { audioVolume } from './audioVolume.svelte.js';

export interface PlayerTrack {
	id: string;
	url: string;
	duration: number;
	peaks: number[];
	authorName?: string;
}

let currentTrack = $state<PlayerTrack | null>(null);
let playing = $state(false);
let currentTime = $state(0);
let loadedDuration = $state(0);
let speed = $state(1);

let audio: HTMLAudioElement | null = null;

function ensureAudio(): HTMLAudioElement {
	if (!audio) {
		audio = new Audio();
		audio.preload = 'metadata';
		audio.crossOrigin = blobCrossOrigin || null;
		audio.volume = audioVolume.value;
		audio.playbackRate = speed;
		audio.addEventListener('timeupdate', () => {
			if (audio) currentTime = audio.currentTime;
		});
		audio.addEventListener('loadedmetadata', () => {
			if (audio && Number.isFinite(audio.duration)) loadedDuration = audio.duration;
		});
		audio.addEventListener('ended', () => {
			playing = false;
			currentTime = 0;
		});
		audio.addEventListener('pause', () => {
			playing = false;
		});
		audio.addEventListener('play', () => {
			playing = true;
		});
	}
	return audio;
}

export const audioPlayer = {
	get current() {
		return currentTrack;
	},
	get playing() {
		return playing;
	},
	get currentTime() {
		return currentTime;
	},
	get duration() {
		return loadedDuration > 0 ? loadedDuration : (currentTrack?.duration ?? 0);
	},
	get speed() {
		return speed;
	},

	play(track: PlayerTrack) {
		const a = ensureAudio();
		if (!currentTrack || currentTrack.id !== track.id) {
			currentTrack = track;
			currentTime = 0;
			loadedDuration = 0;
			a.src = resolveUrl(track.url) ?? '';
		}
		a.volume = audioVolume.value;
		a.playbackRate = speed;
		a.play().catch(() => {
			playing = false;
		});
	},

	toggle() {
		if (!currentTrack) return;
		const a = ensureAudio();
		if (a.paused) {
			a.play().catch(() => {
				playing = false;
			});
		} else {
			a.pause();
		}
	},

	seek(time: number) {
		if (!audio || !currentTrack) return;
		const t = Math.max(0, Math.min(time, audioPlayer.duration));
		audio.currentTime = t;
		currentTime = t;
	},

	setSpeed(s: number) {
		speed = s;
		if (audio) audio.playbackRate = s;
	},

	applyVolume(v: number) {
		if (audio) audio.volume = v;
	},

	close() {
		if (audio) {
			audio.pause();
			audio.src = '';
		}
		currentTrack = null;
		playing = false;
		currentTime = 0;
		loadedDuration = 0;
	},
};
