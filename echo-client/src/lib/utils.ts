import { goto } from '$app/navigation';
import { page } from '$app/state';
import { Mic } from 'lucide-svelte';
import { i18n } from '$lib/i18n/i18n.svelte.js';

export function debounce<T extends (...args: any[]) => void>(fn: T, delay = 300) {
	let timeout: ReturnType<typeof setTimeout>;
	return (...args: Parameters<T>) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => fn(...args), delay);
	};
}

export function getDisplayName(displayName?: string | null, username?: string): string {
	return displayName ?? username ?? '?';
}

export function getInitial(name: string): string {
	return name[0]?.toUpperCase() ?? '?';
}

export function formatPhone(phone: string): string {
	const digits = phone.replace(/\D/g, '');
	if (digits.length === 11 && digits[0] === '7') {
		return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
	}
	if (digits.length === 10) {
		return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
	}
	return phone;
}

// Turn a chat/group "last message" into the short label the sidebars show —
// the text for normal messages, or "Voice message", "Photo", "2 media", etc.
// for attachment-only messages. Shared by every sidebar row so the DM, group,
// and merged All-Chats lists all summarise messages identically.
//
// Attachments arrive untyped from the slim listing endpoints (jsonb on the
// server), so the shape is intentionally loose: we only read `voice` and
// `mimeType` and tolerate either being absent.
type LabelAttachment = { voice?: unknown; mimeType?: string };
type LabelMessage = {
	content?: string | null;
	// Loose on purpose: the slim group-listing endpoint types this as
	// `unknown[]`, while DM/group message shapes give a concrete attachment
	// type. Both narrow to the two fields we actually read below.
	attachments?: unknown[] | null;
} | null;

// A message whose attachments are *all* voice notes — the only summary that
// carries an icon of its own.
function voiceOnlyCount(msg: LabelMessage): number {
	if (!msg) return 0;
	if (msg.content && msg.content.length > 0) return 0;
	const attachments = (msg.attachments ?? []) as LabelAttachment[];
	if (attachments.length === 0) return 0;
	const voices = attachments.filter((a) => !!a.voice);
	return voices.length > 0 && attachments.length === voices.length ? voices.length : 0;
}

// Icon rendered inline ahead of `lastMessageLabel`. The label used to carry a
// 🎤 glyph instead, which sat awkwardly next to the lucide icons around it and
// rendered differently on every platform.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lastMessageIcon(msg: LabelMessage): any | null {
	return voiceOnlyCount(msg) > 0 ? Mic : null;
}

export function lastMessageLabel(msg: LabelMessage): string | undefined {
	if (!msg) return undefined;
	if (msg.content && msg.content.length > 0) return msg.content;
	const attachments = (msg.attachments ?? []) as LabelAttachment[];
	if (attachments.length === 0) return undefined;
	const voiceCount = voiceOnlyCount(msg);
	if (voiceCount > 0) {
		return voiceCount === 1 ? i18n.t.summary.voiceMessage : i18n.t.summary.voiceMessages(voiceCount);
	}

	const audio = attachments.filter((a) => !a.voice && (a.mimeType ?? '').startsWith('audio/'));
	const photos = attachments.filter((a) => !a.voice && (a.mimeType ?? '').startsWith('image/'));
	const videos = attachments.filter((a) => !a.voice && (a.mimeType ?? '').startsWith('video/'));


	const files = attachments.filter(
		(a) =>
			!a.voice &&
			!(a.mimeType ?? '').startsWith('audio/') &&
			!(a.mimeType ?? '').startsWith('image/') &&
			!(a.mimeType ?? '').startsWith('video/'),
	);
	const mediaCount = photos.length + videos.length;
	if (photos.length > 0 && videos.length === 0 && files.length === 0) {
		return photos.length === 1 ? i18n.t.summary.photo : i18n.t.summary.photos(photos.length);
	}
	if (mediaCount > 0 && files.length === 0) {
		return mediaCount === 1 ? i18n.t.summary.media : i18n.t.summary.mediaCount(mediaCount);
	}
	if (audio?.length && files.length === 0 && mediaCount === 0) {
		return audio?.length === 1 ? i18n.t.summary.audioFile : i18n.t.summary.audioFiles(audio.length)
	}
	if (files.length > 0 && mediaCount === 0) {
		return files.length === 1 ? i18n.t.summary.file : i18n.t.summary.files(files.length);
	}

	return i18n.t.summary.attachments(attachments.length);
}

// Human-readable byte size (B / KB / MB) for attachment file sizes.
export function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function gotoKeepSearch(path: string) {
	const url = new URL(page.url);
	url.pathname = path;
	goto(url.toString());
}
