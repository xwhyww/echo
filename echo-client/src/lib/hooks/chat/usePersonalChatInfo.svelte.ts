import { untrack } from 'svelte';
import { goto } from '$app/navigation';
import { auth } from '$lib/stores/auth.svelte.js';
import { personalChatsStore } from '$lib/stores/personalChats.svelte.js';
import { personalChatsService } from '$lib/api/personalChatsService.js';
import { routes } from '$lib/routes.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';
import type { StatItem } from '$lib/components/ui/StatsList.svelte';
import {
	MessageSquare,
	File,
	Image,
	Video,
	Music,
	Mic,
	SmilePlus,
	Users,
	Headphones,
	Link,
} from 'lucide-svelte';

type MediaKind = NonNullable<StatItem['mediaKind']>;

/**
 * Data behind the personal-chat info screen: who the chat is with, and the
 * per-chat attachment counters. `userId` is read through a getter so the hook
 * follows route changes without the page having to re-create it.
 */
export function usePersonalChatInfo(userId: () => string) {
	const id = $derived(userId());
	const isSelf = $derived(id === auth.user?.id);

	const chatEntry = $derived(personalChatsStore.findByUserId(id));
	const companion = $derived(chatEntry?.user ?? personalChatsStore.tempChat?.user);

	const displayName = $derived(
		isSelf
			? (auth.user?.displayName ?? auth.user?.username ?? i18n.t.chat.notes)
			: (companion?.displayName ?? companion?.username ?? i18n.t.chat.user),
	);
	// The self-chat is presented as "Notes", but the avatar stays the user's own.
	const title = $derived(isSelf ? i18n.t.chat.notes : displayName);
	const avatarUrl = $derived(isSelf ? auth.user?.avatarUrl : companion?.avatarUrl);

	let stats = $state({
		totalMessages: 0,
		links: 0,
		photos: 0,
		videos: 0,
		files: 0,
		gifs: 0,
		audio: 0,
		voiceMessages: 0,
		// Not yet backed by the API — kept as zero placeholders for now.
		commonGroups: 0,
		voiceChannels: 0,
	});

	$effect(() => {
		const targetUserId = id;
		if (!targetUserId || auth.loading) return;
		const storeChatId = untrack(() => (chatEntry && !chatEntry.temp ? chatEntry.id : null));

		let cancelled = false;

		async function loadStats() {
			let chatId = storeChatId;
			// Self-chat (Notes) is filtered out of the chats list, so fall back to a lookup.
			if (!chatId) {
				const lookup = await personalChatsService.getByCompanionId(targetUserId);
				if (cancelled) return;
				chatId = lookup.chat?.id ?? null;
			}
			if (!chatId) return;
			const res = await personalChatsService.getStats(chatId);
			if (cancelled) return;
			stats = {
				...stats,
				totalMessages: res.messages,
				links: res.links,
				photos: res.photos,
				videos: res.videos,
				files: res.files,
				gifs: res.gifs,
				audio: res.audio,
				voiceMessages: res.voiceMessages,
			};
		}

		loadStats().catch(() => {});
		return () => {
			cancelled = true;
		};
	});

	const items = $derived<StatItem[]>([
		{
			icon: MessageSquare,
			label: i18n.t.stats.messages,
			value: stats.totalMessages,
			action: () => goto(routes.chats.perschatUser(id)),
		},
		{ icon: Image, label: i18n.t.stats.photos, value: stats.photos, mediaKind: 'photos' },
		{ icon: Video, label: i18n.t.stats.videos, value: stats.videos, mediaKind: 'videos' },
		{ icon: File, label: i18n.t.stats.files, value: stats.files, mediaKind: 'files' },
		{ icon: Link, label: i18n.t.stats.links, value: stats.links, mediaKind: 'links' },
		{ icon: Music, label: i18n.t.stats.audio, value: stats.audio, mediaKind: 'audio' },
		{ icon: Mic, label: i18n.t.stats.voiceMessages, value: stats.voiceMessages },
		{ icon: SmilePlus, label: i18n.t.stats.gifs, value: stats.gifs, mediaKind: 'gifs' },
		{ icon: Users, label: i18n.t.stats.commonGroups, value: stats.commonGroups },
		{ icon: Headphones, label: i18n.t.stats.voiceChannels, value: stats.voiceChannels },
	]);

	return {
		get userId() { return id; },
		get isSelf() { return isSelf; },
		get companion() { return companion; },
		get displayName() { return displayName; },
		get title() { return title; },
		get avatarUrl() { return avatarUrl ?? null; },
		get items() { return items; },
		openMedia(kind: MediaKind) {
			goto(routes.chats.perschatMedia(id, kind));
		},
		openProfile() {
			goto(routes.user(id));
		},
	};
}
