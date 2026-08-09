import { page } from '$app/state';
import { groupsService } from '$lib/api/groupsService.js';
import { voiceService } from '$lib/api/voiceService.js';
import { auth } from '$lib/stores/auth.svelte.js';
import { useGroupMemberIndex } from '$lib/hooks/groups/useGroupMemberIndex.svelte.js';
import { groupsStore } from '$lib/stores/groups.svelte.js';
import type { WsEvent } from '$lib/stores/ws.svelte.js';
import type { ChatPanelEvent } from '$lib/chat/types.js';
import type { VoiceChannelMessage } from '$lib/api/voiceChat.js';

/**
 * A voice channel's text chat, as a screen of its own.
 *
 * Route-bound: it reads the group and channel out of the URL rather than being
 * handed them, so the chat can be linked to and reloaded into directly — it is
 * no longer only reachable from inside a channel you have joined. That is also
 * why the channel's name is looked up rather than read off the live connection:
 * arriving here does not mean being connected to it.
 */
export function useVoiceChannelChatPage() {
	const groupId = $derived(page.params.id!);
	const channelId = $derived(page.params.channelId!);

	let channelName = $state<string | null>(null);
	let fetchedGroupName = $state<string | null>(null);

	const roster = useGroupMemberIndex(() => groupId);

	/**
	 * The store first, because when it is warm the name is there for the first
	 * frame — but never *only* the store. It is filled by `useGroups`, which the
	 * chats sidebar calls, and the sidebar is not mounted on a fullscreen chat
	 * surface: opening this screen from a cold reload would leave the name blank
	 * forever. So the group is also fetched, and the two race in the right order.
	 */
	const groupName = $derived(
		groupsStore.list.find((g) => g.id === groupId)?.name ?? fetchedGroupName,
	);

	$effect(() => {
		const gid = groupId;
		if (!gid) return;
		if (groupsStore.list.some((g) => g.id === gid)) return;
		let cancelled = false;
		groupsService
			.get(gid)
			.then((info) => {
				if (cancelled) return;
				fetchedGroupName = info.group.name;
				// Everything else that reads the store gets it for free from here on.
				groupsStore.upsert(info.group);
			})
			.catch((err) => console.error('[useVoiceChannelChatPage] group lookup failed', err));
		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		const gid = groupId;
		const cid = channelId;
		if (!gid || !cid) return;
		channelName = null;
		let cancelled = false;
		voiceService
			.listChannels(gid)
			.then((res) => {
				if (cancelled) return;
				channelName = res.channels.find((c) => c.id === cid)?.name ?? null;
			})
			.catch((err) => console.error('[useVoiceChannelChatPage] channel lookup failed', err));
		return () => {
			cancelled = true;
		};
	});

	// The voice service inlines author info on every message row, so authors
	// accumulate as messages stream in — which covers reactors who are not (or
	// not yet) in the group's member list.
	let authors = $state(new Map<string, { name: string; avatarUrl: string | null }>());

	function trackMessage(msg: VoiceChannelMessage) {
		const next = new Map(authors);
		next.set(msg.author.id, {
			name: msg.author.displayName ?? msg.author.username,
			avatarUrl: msg.author.avatarUrl ?? null,
		});
		authors = next;
	}

	function reactorLookup(userId: string) {
		const member = roster.find(userId);
		if (member) return member;
		const a = authors.get(userId);
		if (a) return a;
		const me = auth.user;
		if (me && me.id === userId) {
			return { name: me.displayName ?? me.username, avatarUrl: me.avatarUrl ?? null };
		}
		return null;
	}

	/** Only the events for this channel, mapped onto what `ChatPanel` consumes. */
	function matchEvent(e: WsEvent): ChatPanelEvent | null {
		switch (e.type) {
			case 'voice_channel_message':
				if (e.channelId !== channelId) return null;
				return { kind: 'message', message: e.message };
			case 'voice_channel_message_edited':
				if (e.channelId !== channelId) return null;
				return {
					kind: 'edited',
					messageId: e.messageId,
					content: e.content,
					attachments: e.attachments,
					updatedAt: e.updatedAt,
				};
			case 'voice_channel_message_deleted':
				if (e.channelId !== channelId) return null;
				return { kind: 'deleted', messageId: e.messageId };
			case 'voice_channel_message_pinned':
				if (e.channelId !== channelId) return null;
				return {
					kind: 'pinned',
					messageId: e.messageId,
					pinnedAt: e.pinnedAt,
					pinnedBy: e.pinnedBy,
				};
			case 'voice_channel_message_unpinned':
				if (e.channelId !== channelId) return null;
				return { kind: 'unpinned', messageId: e.messageId };
			case 'voice_channel_message_reaction':
				if (e.channelId !== channelId) return null;
				return { kind: 'reaction', messageId: e.messageId, reactions: e.reactions };
			default:
				return null;
		}
	}

	return {
		get groupId() { return groupId; },
		get channelId() { return channelId; },
		get channelName() { return channelName; },
		get groupName() { return groupName; },
		trackMessage,
		reactorLookup,
		matchEvent,
	};
}
