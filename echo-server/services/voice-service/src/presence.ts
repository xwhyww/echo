import { eq } from 'drizzle-orm';
import type { VoiceParticipantEvent } from '@echo/shared';
import { createDb } from './db/index.js';
import { voiceChannels, userCache } from './db/schema.js';
import { channelAudience } from './permissions.js';
import { config } from './config.js';
import { publishVoiceParticipant } from './nats.js';
import { log } from './log.js';

const db = createDb(config.databaseUrl);

export interface ParticipantFlags {
	micMuted: boolean;
	deafened: boolean;
	sharing: boolean;
}

export async function loadParticipantPayload(userId: string): Promise<{
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
}> {
	const [u] = await db
		.select({
			username: userCache.username,
			displayName: userCache.displayName,
			avatarUrl: userCache.avatarUrl,
		})
		.from(userCache)
		.where(eq(userCache.id, userId))
		.limit(1);
	return {
		username: u?.username ?? userId,
		displayName: u?.displayName ?? null,
		avatarUrl: u?.avatarUrl ?? null,
	};
}

/**
 * Fan a presence change out over NATS to everyone who may see the channel.
 *
 * It does not re-check the *subject's* authority, and must not: both callers
 * have already established it in their own way — the presence endpoint
 * validates the caller's membership and channel access, while the LiveKit
 * webhook is the server-side ground truth for who is actually connected. In
 * particular a `left` event must go out even for a user who has since been
 * removed from the group, otherwise they linger in everyone's sidebar forever.
 *
 * What it does check is the *audience*: see `channelAudience`.
 *
 * Returns false when the channel no longer exists (deleted mid-call), which is
 * not an error — subscribers already got `voice_channel_deleted`.
 */
export async function fanOutParticipantEvent(opts: {
	channelId: string;
	userId: string;
	kind: VoiceParticipantEvent['kind'];
	state: ParticipantFlags;
}): Promise<boolean> {
	const [ch] = await db
		.select()
		.from(voiceChannels)
		.where(eq(voiceChannels.id, opts.channelId))
		.limit(1);
	if (!ch) return false;

	const profile = await loadParticipantPayload(opts.userId);

	// Target = everyone who may see this channel, plus the subject so their own
	// tabs and devices update too. For an open channel that is the whole group;
	// for a restricted one it is only the members whose roles grant access.
	//
	// The narrowing matters because the list and join endpoints guard the API
	// but not this: without it, a participant's id and display name flash
	// through the WebSocket firehose to members who cannot see the channel at
	// all, which tells them who is talking to whom in a private room.
	const targetUserIds = await channelAudience(ch.id, ch.groupId, opts.userId);

	const event: VoiceParticipantEvent = {
		targetUserIds,
		groupId: ch.groupId,
		channelId: ch.id,
		kind: opts.kind,
		participant: {
			userId: opts.userId,
			username: profile.username,
			displayName: profile.displayName,
			avatarUrl: profile.avatarUrl,
			micMuted: opts.state.micMuted,
			deafened: opts.state.deafened,
			sharing: opts.state.sharing,
		},
	};

	await publishVoiceParticipant(event).catch((err) => {
		log.warn({ err }, 'publishVoiceParticipant failed');
	});

	return true;
}
