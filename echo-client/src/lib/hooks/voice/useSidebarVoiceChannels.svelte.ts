import { goto } from '$app/navigation';
import { routes } from '$lib/routes.js';
import { voiceService } from '$lib/api/voiceService.js';
import { voiceClient } from '$lib/stores/voiceClient.svelte.js';
import { ws, type WsEvent } from '$lib/stores/ws.svelte.js';
import {
	isVoiceVisibilityEvent,
	reduceVoiceListEvent,
	splitByCategory,
} from '$lib/utils/voiceChannels.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';
import type { VoiceChannel, VoiceCategory } from '$lib/api/voice.js';

/**
 * The voice-channel accordion hanging under a group in the sidebar: a lazy list
 * that only loads once opened, keeps itself current from the socket, and joins
 * a channel on click.
 *
 * The full-page equivalent is `useGroupVoiceChannels` — same data, but it also
 * owns creating, renaming and deleting. This one is read-and-join only.
 */
export function useSidebarVoiceChannels(getGroupId: () => string) {
	const t = $derived(i18n.t);

	let expanded = $state(false);
	let channels = $state<VoiceChannel[]>([]);
	let categories = $state<VoiceCategory[]>([]);
	let loaded = $state(false);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let joiningId = $state<string | null>(null);

	// Categories the user has clicked. Anything absent follows the auto rule
	// below; the map exists so a manual choice survives the participant updates
	// that would otherwise keep re-deciding it.
	let manualCollapse = $state<Map<string, boolean>>(new Map());

	// A fetch in flight is about to replace `channels` wholesale, so an event
	// arriving in that window would either patch a list that's about to be
	// discarded or be dropped by the `loaded` guard. Park them and replay.
	let inFlight = 0;
	let queued: WsEvent[] = [];

	const split = $derived(splitByCategory(channels, null));
	const isEmpty = $derived(channels.length === 0 && categories.length === 0);

	$effect(() => {
		const id = getGroupId();
		return ws.on((event) => {
			if (inFlight > 0) {
				queued.push(event);
				return;
			}
			apply(event, id);
		});
	});

	// While the socket was down we missed events outright, so an open accordion
	// re-syncs from scratch.
	$effect(() => {
		const id = getGroupId();
		return ws.on((event) => {
			if (event.type === 'reconnected' && expanded && loaded) void load(id, { silent: true });
		});
	});

	function apply(event: WsEvent, groupId: string) {
		if (!loaded) return;
		if (isVoiceVisibilityEvent(event, groupId)) {
			void load(groupId, { silent: true });
			return;
		}
		const next = reduceVoiceListEvent({ channels, categories }, event, groupId);
		if (!next) return;
		channels = next.channels;
		categories = next.categories;
	}

	async function load(groupId: string, opts: { silent?: boolean } = {}) {
		// A background refresh keeps the cached list on screen; only the first,
		// user-triggered open is allowed to show a spinner.
		if (!opts.silent) {
			if (loaded || loading) return;
			loading = true;
			loadError = null;
		}
		inFlight++;
		try {
			const res = await voiceService.listChannels(groupId);
			channels = res.channels;
			categories = res.categories;
			loaded = true;
			if (!opts.silent) loadError = null;
		} catch (err) {
			console.error('[useSidebarVoiceChannels] load failed', err);
			if (!opts.silent) loadError = t.sidebar.loadVoiceFailed;
		} finally {
			if (!opts.silent) loading = false;
			inFlight--;
			if (inFlight === 0 && queued.length > 0) {
				const replay = queued;
				queued = [];
				for (const event of replay) apply(event, groupId);
			}
		}
	}

	/**
	 * Collapsed unless somebody is in one of the category's channels — so an
	 * active conversation surfaces itself — until the user overrides it.
	 */
	function isCollapsed(categoryId: string): boolean {
		const manual = manualCollapse.get(categoryId);
		if (manual !== undefined) return manual;
		const chs = split.byCategory.get(categoryId) ?? [];
		return !chs.some((c) => (c.participants?.length ?? 0) > 0);
	}

	return {
		get expanded() { return expanded; },
		get loading() { return loading; },
		get loadError() { return loadError; },
		get isEmpty() { return isEmpty; },
		get categories() { return categories; },
		get uncategorized() { return split.uncategorized; },
		channelsIn(categoryId: string) { return split.byCategory.get(categoryId) ?? []; },

		toggle() {
			expanded = !expanded;
			if (expanded && !loaded) void load(getGroupId());
		},

		isCollapsed,
		toggleCategory(categoryId: string) {
			const next = new Map(manualCollapse);
			next.set(categoryId, !isCollapsed(categoryId));
			manualCollapse = next;
		},

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
				goto(`${routes.chats.groupVoice(getGroupId())}/${channel.id}`);
			} catch (err) {
				console.error('[useSidebarVoiceChannels] join failed', err);
			} finally {
				joiningId = null;
			}
		},

		openManagePage() {
			goto(routes.chats.groupVoice(getGroupId()));
		},
	};
}
