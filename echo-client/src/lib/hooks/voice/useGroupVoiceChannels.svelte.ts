import { untrack } from 'svelte';
import { page } from '$app/state';
import { goto } from '$app/navigation';
import { voiceService } from '$lib/api/voiceService.js';
import { voiceClient } from '$lib/stores/voiceClient.svelte.js';
import { groupsService } from '$lib/api/groupsService.js';
import { groupsStore } from '$lib/stores/groups.svelte.js';
import { ws } from '$lib/stores/ws.svelte.js';
import { toasts } from '$lib/stores/toasts.svelte.js';
import { confirm } from '$lib/stores/confirm.svelte.js';
import {
	isVoiceVisibilityEvent,
	reduceVoiceListEvent,
	sortCategories,
	splitByCategory,
} from '$lib/utils/voiceChannels.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';
import { routes } from '$lib/routes.js';
import type { VoiceChannel, VoiceCategory } from '$lib/api/voice.js';
import type { Group } from '$lib/api/groups.js';

/**
 * The group's voice channel list: the data and its live reconciliation, joining
 * a channel, and the delete-with-undo flows for both channels and categories.
 * The modals that create and edit them own their own drafts — this only tracks
 * which one is open.
 */
export function useGroupVoiceChannels() {
	const t = $derived(i18n.t);

	const groupId = $derived(page.params.id!);
	let group = $state<Group | null>(null);
	let channels = $state<VoiceChannel[]>([]);
	let categories = $state<VoiceCategory[]>([]);
	let collapsed = $state<Set<string>>(new Set());

	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let joiningId = $state<string | null>(null);

	// While set, the target is hidden from the list and the API call only fires
	// when the UndoBar's timer completes; cancelling restores it.
	let pendingDeleteChannel = $state<VoiceChannel | null>(null);
	let pendingDeleteCategory = $state<VoiceCategory | null>(null);

	// Only one kebab is ever open, so a plain id beats a stack.
	let menuFor = $state<string | null>(null);

	const canManage = $derived(group?.role === 'owner' || group?.role === 'admin');

	const visibleChannels = $derived(
		pendingDeleteChannel
			? channels.filter((c) => c.id !== pendingDeleteChannel!.id)
			: channels,
	);

	const visibleCategories = $derived(
		pendingDeleteCategory
			? categories.filter((c) => c.id !== pendingDeleteCategory!.id)
			: categories,
	);

	const split = $derived(
		splitByCategory(visibleChannels, pendingDeleteCategory?.id ?? null),
	);

	const isEmpty = $derived(visibleChannels.length === 0 && visibleCategories.length === 0);

	// ─── Load + live updates ──────────────────────────────────
	$effect(() => {
		const id = groupId;
		if (!id) return;
		untrack(() => {
			void load(id);
		});
	});

	$effect(() => {
		const id = groupId;
		return ws.on((event) => {
			if (isVoiceVisibilityEvent(event, id)) {
				void load(id);
				return;
			}
			const next = reduceVoiceListEvent({ channels, categories }, event, id);
			if (!next) return;
			channels = next.channels;
			categories = next.categories;
			// A delete that lands from the server while our own undo bar is still
			// counting down settles the question — drop the pending state so the
			// bar's timeout doesn't fire a second request.
			if (event.type === 'voice_channel_deleted' && pendingDeleteChannel?.id === event.channelId) {
				pendingDeleteChannel = null;
			}
			if (event.type === 'voice_category_deleted' && pendingDeleteCategory?.id === event.categoryId) {
				pendingDeleteCategory = null;
			}
		});
	});

	async function load(id: string) {
		loading = true;
		loadError = null;
		try {
			const [info, list] = await Promise.all([
				groupsService.get(id),
				voiceService.listChannels(id),
			]);
			group = info.group;
			channels = list.channels;
			categories = list.categories;
			groupsStore.patch(id, info.group);
		} catch (err) {
			console.error('[useGroupVoiceChannels] load failed', err);
			loadError = t.voice.loadFailed;
		} finally {
			loading = false;
		}
	}

	return {
		get groupId() { return groupId; },
		get group() { return group; },
		get canManage() { return canManage; },
		get loading() { return loading; },
		get loadError() { return loadError; },
		get isEmpty() { return isEmpty; },
		get categories() { return categories; },
		get visibleCategories() { return visibleCategories; },
		get uncategorized() { return split.uncategorized; },
		channelsIn(categoryId: string) { return split.byCategory.get(categoryId) ?? []; },
		get settingsHref() { return routes.chats.groupVoiceSettings(groupId); },

		isCollapsed(categoryId: string) { return collapsed.has(categoryId); },
		toggleCategory(categoryId: string) {
			const next = new Set(collapsed);
			if (next.has(categoryId)) next.delete(categoryId);
			else next.add(categoryId);
			collapsed = next;
		},

		isMenuOpen(id: string) { return menuFor === id; },
		toggleMenu(id: string) { menuFor = menuFor === id ? null : id; },
		closeMenu() { menuFor = null; },

		// ─── Join ─────────────────────────────────────────────
		get joiningId() { return joiningId; },
		isCurrent(channelId: string) { return voiceClient.currentChannel?.id === channelId; },
		/**
		 * For the channel we're personally in, the LiveKit client knows who's
		 * presenting in real time (including us) — overlay that on the
		 * server-derived `sharing` so the badge is instant.
		 */
		liveShareIds(channelId: string): Set<string> | null {
			if (voiceClient.currentChannel?.id !== channelId) return null;
			return new Set(voiceClient.screenShares.map((s) => s.identity));
		},
		async join(channel: VoiceChannel) {
			joiningId = channel.id;
			try {
				await voiceClient.connect(channel.id);
				goto(`${routes.chats.groupVoice(groupId)}/${channel.id}`);
			} catch (err) {
				console.error('[useGroupVoiceChannels] join failed', err);
				toasts.error((err as Error).message ?? t.voice.joinFailed);
			} finally {
				joiningId = null;
			}
		},

		// ─── Local list updates the modals hand back ──────────
		addChannel(channel: VoiceChannel) {
			if (!channels.some((c) => c.id === channel.id)) channels = [channel, ...channels];
		},
		addCategory(category: VoiceCategory) {
			if (!categories.some((c) => c.id === category.id)) {
				categories = sortCategories([...categories, category]);
			}
		},

		// ─── Delete with undo ─────────────────────────────────
		get pendingDeleteChannel() { return pendingDeleteChannel; },
		get pendingDeleteCategory() { return pendingDeleteCategory; },
		cancelDeleteChannel() { pendingDeleteChannel = null; },
		cancelDeleteCategory() { pendingDeleteCategory = null; },

		async startDeleteChannel(channel: VoiceChannel) {
			menuFor = null;
			const ok = await confirm({
				title: t.voice.deleteChannelTitle,
				message: t.voice.deleteChannelBody(channel.name),
				tone: 'danger',
				confirmLabel: t.voice.deleteChannel,
				requireText: channel.name,
			});
			if (ok) pendingDeleteChannel = channel;
		},
		async commitDeleteChannel() {
			const target = pendingDeleteChannel;
			if (!target) return;
			pendingDeleteChannel = null;
			try {
				await voiceService.deleteChannel(target.id);
			} catch (err) {
				console.error('[useGroupVoiceChannels] delete channel failed', err);
				toasts.error((err as Error).message ?? t.voice.deleteChannelFailed);
			}
		},

		async startDeleteCategory(cat: VoiceCategory) {
			menuFor = null;
			const ok = await confirm({
				title: t.voice.deleteCategoryTitle,
				message: t.voice.deleteCategoryBody(cat.name),
				tone: 'danger',
				confirmLabel: t.voice.deleteCategory,
				requireText: cat.name,
			});
			if (ok) pendingDeleteCategory = cat;
		},
		async commitDeleteCategory() {
			const target = pendingDeleteCategory;
			if (!target) return;
			pendingDeleteCategory = null;
			try {
				await voiceService.deleteCategory(target.id);
			} catch (err) {
				console.error('[useGroupVoiceChannels] delete category failed', err);
				toasts.error((err as Error).message ?? t.voice.deleteCategoryFailed);
			}
		},
	};
}
