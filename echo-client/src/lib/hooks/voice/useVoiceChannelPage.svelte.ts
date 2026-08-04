import { untrack } from 'svelte';
import { page } from '$app/state';
import { goto } from '$app/navigation';
import { voiceClient, ConnectionState } from '$lib/stores/voiceClient.svelte.js';
import { ws } from '$lib/stores/ws.svelte.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';
import { routes } from '$lib/routes.js';
import type { VoiceParticipant } from '$lib/stores/voiceClient.svelte.js';

/**
 * A voice channel you are sitting in: the connection, who else is here, whose
 * screen you are watching, and the way out. Route-bound — it reads `page`
 * itself and joins whichever channel the URL names.
 */
export function useVoiceChannelPage() {
	const t = $derived(i18n.t);

	const groupId = $derived(page.params.id!);
	const channelId = $derived(page.params.channelId!);
	const channelsHref = $derived(routes.chats.groupVoice(groupId));

	let error = $state<string | null>(null);
	let chatOpen = $state(false);
	let sharePopupOpen = $state(false);

	// The share the user has zoomed into from the grid. We never auto-open one;
	// watching is always opt-in.
	let focusedShareId = $state<string | null>(null);

	const focusedShare = $derived(
		focusedShareId
			? (voiceClient.screenShares.find((s) => s.identity === focusedShareId) ?? null)
			: null,
	);

	const sharingIdentities = $derived(new Set(voiceClient.screenShares.map((s) => s.identity)));

	// Preferred tile size shrinks as more people join. The grid is auto-fit, so
	// the real width still flexes with the container — this is a target, not a cap.
	const tileSize = $derived.by(() => {
		const n = Math.max(1, voiceClient.participants.length);
		if (n === 1) return 240;
		if (n <= 2) return 200;
		if (n <= 4) return 160;
		if (n <= 9) return 120;
		if (n <= 16) return 96;
		return 76;
	});

	let volumeMenu = $state<{
		x: number;
		y: number;
		identity: string;
		name: string;
		isLocal: boolean;
	} | null>(null);

	// If the share we're watching ends — presenter stopped, disconnected, or we
	// left — drop the reference rather than render a tile with no track.
	$effect(() => {
		if (focusedShareId && !voiceClient.screenShares.some((s) => s.identity === focusedShareId)) {
			focusedShareId = null;
		}
	});

	$effect(() => {
		const id = channelId;
		if (!id) return;
		// Read the connection state untracked: otherwise clicking Leave sets
		// currentChannel/isConnected, this effect re-runs against the still
		// unchanged URL, and reconnects us right back.
		const alreadyHere = untrack(
			() => voiceClient.currentChannel?.id === id && voiceClient.isConnected,
		);
		if (alreadyHere) return;
		void connect(id);
	});

	$effect(() => {
		const cId = channelId;
		const href = channelsHref;
		return ws.on((event) => {
			if (event.type !== 'voice_channel_deleted' || event.channelId !== cId) return;
			// voiceClient handles its own disconnect on this same event; all that's
			// left is getting the user off a page that no longer refers to anything.
			goto(href);
		});
	});

	async function connect(id: string) {
		try {
			await voiceClient.connect(id);
		} catch (err) {
			console.error('[useVoiceChannelPage] connect failed', err);
			error = (err as Error).message || t.voice.connectFailed;
		}
	}

	return {
		get groupId() { return groupId; },
		get channelId() { return channelId; },
		get channelName() { return voiceClient.currentChannel?.name ?? null; },
		get error() { return error; },
		get connecting() { return voiceClient.connectionState === ConnectionState.Connecting; },
		get connected() { return !!voiceClient.currentChannel; },
		get showQuality() { return !!voiceClient.currentChannel && voiceClient.isConnected; },
		get participants() { return voiceClient.participants; },
		get tileSize() { return tileSize; },

		get focusedShare() { return focusedShare; },
		shareFor(identity: string) {
			if (!sharingIdentities.has(identity)) return null;
			return voiceClient.screenShares.find((s) => s.identity === identity) ?? null;
		},
		watchShare(identity: string) { focusedShareId = identity; },
		unfocusShare() { focusedShareId = null; },

		get chatOpen() { return chatOpen; },
		toggleChat() { chatOpen = !chatOpen; },
		closeChat() { chatOpen = false; },

		get sharePopupOpen() { return sharePopupOpen; },
		openSharePopup() { sharePopupOpen = true; },
		closeSharePopup() { sharePopupOpen = false; },

		get volumeMenu() { return volumeMenu; },
		openVolumeMenu(x: number, y: number, p: VoiceParticipant) {
			volumeMenu = { x, y, identity: p.identity, name: p.name, isLocal: p.isLocal };
		},
		closeVolumeMenu() { volumeMenu = null; },

		retry() {
			error = null;
			void connect(channelId);
		},
		back() { goto(channelsHref); },
		async leave() {
			// Navigate away first so the page unmounts before any reactive read
			// could re-fire the connect effect, then drop the LiveKit connection.
			await goto(channelsHref);
			await voiceClient.disconnect();
		},
	};
}
