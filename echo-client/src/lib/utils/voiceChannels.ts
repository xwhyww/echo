import type { VoiceChannel, VoiceCategory, VoiceChannelParticipant } from '$lib/api/voice.js';
import type { WsEvent } from '$lib/stores/ws.svelte.js';

/** How many participant avatars a row shows before collapsing into "+N". */
export const MAX_AVATARS = 5;

export function participantLabel(p: { displayName: string | null; username: string }): string {
	return p.displayName?.trim() || p.username;
}

export function sortedParticipants(ch: VoiceChannel): VoiceChannelParticipant[] {
	return (ch.participants ?? [])
		.slice()
		.sort((a, b) =>
			participantLabel(a).localeCompare(participantLabel(b), undefined, { sensitivity: 'base' }),
		);
}

/** Server order: by position, ties broken by age so it never jitters. */
export function sortCategories(categories: VoiceCategory[]): VoiceCategory[] {
	return [...categories].sort(
		(a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt),
	);
}

/**
 * Splits the channel list the way the page renders it. `orphanedCategoryId` is
 * the category currently inside its undo window: its children show up as
 * uncategorized, which is where the server will put them once the delete
 * commits.
 */
export function splitByCategory(
	channels: VoiceChannel[],
	orphanedCategoryId: string | null,
): { uncategorized: VoiceChannel[]; byCategory: Map<string, VoiceChannel[]> } {
	const uncategorized: VoiceChannel[] = [];
	const byCategory = new Map<string, VoiceChannel[]>();

	for (const ch of channels) {
		const categoryId = ch.categoryId ?? null;
		if (categoryId === null || categoryId === orphanedCategoryId) {
			uncategorized.push(ch);
			continue;
		}
		const list = byCategory.get(categoryId);
		if (list) list.push(ch);
		else byCategory.set(categoryId, [ch]);
	}

	return { uncategorized, byCategory };
}

/** The pair of lists every voice-channel view keeps. */
export interface VoiceListState {
	channels: VoiceChannel[];
	categories: VoiceCategory[];
}

/**
 * Whether an event changes *which* channels this user may see, rather than the
 * channels themselves. Nothing client-side can settle these — the list endpoint
 * is the authority on visibility — so callers re-fetch instead of patching.
 */
export function isVoiceVisibilityEvent(event: WsEvent, groupId: string): boolean {
	return (
		(event.type === 'voice_channel_access_changed'
			|| event.type === 'voice_role_deleted'
			|| event.type === 'voice_role_members_changed')
		&& event.groupId === groupId
	);
}

/**
 * Folds one socket event into a group's channel and category lists. Returns the
 * next state, or `null` when the event doesn't touch these lists — which is the
 * common case, since every subscriber sees every event.
 *
 * Visibility events are *not* handled here; see `isVoiceVisibilityEvent`.
 */
export function reduceVoiceListEvent(
	state: VoiceListState,
	event: WsEvent,
	groupId: string,
): VoiceListState | null {
	const { channels, categories } = state;

	switch (event.type) {
		case 'voice_participant': {
			if (event.groupId !== groupId) return null;
			return {
				categories,
				channels: channels.map((ch) => {
					if (ch.id !== event.channelId) return ch;
					const others = (ch.participants ?? []).filter(
						(p) => p.userId !== event.participant.userId,
					);
					// joined / updated both mean "this is the current entry", so
					// replace-or-append covers them in one move.
					if (event.kind === 'left') return { ...ch, participants: others };
					return { ...ch, participants: [...others, event.participant] };
				}),
			};
		}

		case 'voice_channel_created': {
			if (event.channel.groupId !== groupId) return null;
			if (channels.some((c) => c.id === event.channel.id)) return null;
			return { categories, channels: [event.channel, ...channels] };
		}

		case 'voice_channel_updated': {
			if (event.groupId !== groupId) return null;
			return {
				categories,
				channels: channels.map((c) =>
					c.id === event.channelId ? { ...c, ...event.patch } : c,
				),
			};
		}

		case 'voice_channel_deleted': {
			if (event.groupId !== groupId) return null;
			return { categories, channels: channels.filter((c) => c.id !== event.channelId) };
		}

		case 'voice_category_created': {
			if (event.category.groupId !== groupId) return null;
			if (categories.some((c) => c.id === event.category.id)) return null;
			return { channels, categories: sortCategories([...categories, event.category]) };
		}

		case 'voice_category_updated': {
			if (event.groupId !== groupId) return null;
			return {
				channels,
				categories: sortCategories(
					categories.map((c) => (c.id === event.categoryId ? { ...c, ...event.patch } : c)),
				),
			};
		}

		case 'voice_category_deleted': {
			if (event.groupId !== groupId) return null;
			// The server orphans the channels (categoryId → null) and emits a
			// `voice_channel_updated` for each, so they need no handling here.
			return { channels, categories: categories.filter((c) => c.id !== event.categoryId) };
		}

		default:
			return null;
	}
}
