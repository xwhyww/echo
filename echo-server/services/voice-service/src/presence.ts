import { eq } from 'drizzle-orm';
import type { VoiceParticipantEvent } from '@echo/shared';
import { createDb } from './db/index.js';
import { voiceChannels, groupMembersMirror, userCache } from './db/schema.js';
import { config } from './config.js';
import { publishVoiceParticipant } from './nats.js';

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
 * Fan a presence change out to every member of the channel's group over NATS.
 *
 * Deliberately performs no permission checks: both callers have already
 * established authority in their own way — the presence endpoint validates the
 * caller's membership and channel access, while the LiveKit webhook is the
 * server-side ground truth for who is actually connected. In particular a
 * `left` event must go out even for a user who has since been removed from the
 * group, otherwise they linger in everyone's sidebar forever.
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

	// Target = all members of the group (including the subject so their other
	// open tabs / devices see the update too).
	// TODO: For restricted channels, narrow this to visible users only so a
	// participant identity doesn't leak to members without channel access.
	// The list/join endpoints already block the unauthorized; this would prevent
	// the participant userId/name flashing through the WS firehose.
	const members = await db
		.select({ userId: groupMembersMirror.userId })
		.from(groupMembersMirror)
		.where(eq(groupMembersMirror.groupId, ch.groupId));

	const event: VoiceParticipantEvent = {
		targetUserIds: members.map((m) => m.userId),
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
		console.warn('[voice] publishVoiceParticipant failed:', err);
	});

	return true;
}
