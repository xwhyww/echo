import { goto } from '$app/navigation';
import { groupsService } from '$lib/api/groupsService.js';
import { groupsStore } from '$lib/stores/groups.svelte.js';
import { routes } from '$lib/routes.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';
import type { Group, GroupMember } from '$lib/api/groups.js';
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
	Link,
} from 'lucide-svelte';

type MediaKind = NonNullable<StatItem['mediaKind']>;

/**
 * Data behind the group info screen: the group itself, its member list and the
 * attachment counters. `groupId` is read through a getter so the hook follows
 * route changes without the page having to re-create it.
 */
export function useGroupInfo(groupId: () => string) {
	const id = $derived(groupId());

	let group = $state<Group | null>(null);
	let members = $state<GroupMember[]>([]);
	let loading = $state(true);

	let stats = $state({
		totalMessages: 0,
		links: 0,
		photos: 0,
		videos: 0,
		files: 0,
		gifs: 0,
		audio: 0,
		voiceMessages: 0,
	});

	$effect(() => {
		const target = id;
		if (!target) return;
		let cancelled = false;
		loading = true;

		(async () => {
			try {
				const [info, s] = await Promise.all([
					groupsService.get(target),
					groupsService.getStats(target),
				]);
				if (cancelled) return;
				group = info.group;
				members = info.members;
				stats = {
					...stats,
					totalMessages: s.messages,
					links: s.links,
					photos: s.photos,
					videos: s.videos,
					files: s.files,
					gifs: s.gifs,
					audio: s.audio,
					voiceMessages: s.voiceMessages,
				};
				groupsStore.patch(target, info.group);
			} catch (err) {
				console.error('[group-info] load failed', err);
			} finally {
				if (!cancelled) loading = false;
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	const items = $derived<StatItem[]>([
		{
			icon: MessageSquare,
			label: i18n.t.stats.messages,
			value: stats.totalMessages,
			action: () => goto(routes.chats.group(id)),
		},
		{
			icon: Users,
			label: i18n.t.stats.members,
			value: members.length,
			action: () => goto(routes.chats.groupSettings(id)),
		},
		{ icon: Image, label: i18n.t.stats.photos, value: stats.photos, mediaKind: 'photos' },
		{ icon: Video, label: i18n.t.stats.videos, value: stats.videos, mediaKind: 'videos' },
		{ icon: File, label: i18n.t.stats.files, value: stats.files, mediaKind: 'files' },
		{ icon: Link, label: i18n.t.stats.links, value: stats.links, mediaKind: 'links' },
		{ icon: Music, label: i18n.t.stats.audio, value: stats.audio, mediaKind: 'audio' },
		{ icon: Mic, label: i18n.t.stats.voiceMessages, value: stats.voiceMessages },
		{ icon: SmilePlus, label: i18n.t.stats.gifs, value: stats.gifs, mediaKind: 'gifs' },
	]);

	return {
		get groupId() { return id; },
		get group() { return group; },
		get members() { return members; },
		// The shell also waits on `group` itself: the fetch can resolve without
		// one (deleted mid-navigation), and the profile block has nothing to show.
		get loading() { return loading || !group; },
		get memberCount() { return i18n.t.groupInfo.memberCount(members.length); },
		get items() { return items; },
		openMedia(kind: MediaKind) {
			goto(routes.chats.groupMedia(id, kind));
		},
		openChat() {
			goto(routes.chats.group(id));
		},
		openVoice() {
			goto(routes.chats.groupVoice(id));
		},
		openSettings() {
			goto(routes.chats.groupSettings(id));
		},
	};
}
