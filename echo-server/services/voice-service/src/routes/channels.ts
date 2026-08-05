import { Hono } from 'hono';
import { and, eq, asc, desc, inArray, count } from 'drizzle-orm';
import { authMiddleware, type AuthEnv, type VoiceParticipantEvent } from '@echo/shared';
import { createDb } from '../db/index.js';
import { voiceChannels, voiceChannelCategories, groupMembersMirror, userCache } from '../db/schema.js';
import { config } from '../config.js';
import { createJoinToken, createScreenToken, listActiveParticipants, deleteRoom } from '../livekit.js';
import { fanOutParticipantEvent } from '../presence.js';
import {
	publishVoiceChannelCreated,
	publishVoiceChannelUpdated,
	publishVoiceChannelDeleted,
	publishVoiceCategoryCreated,
	publishVoiceCategoryUpdated,
	publishVoiceCategoryDeleted,
} from '../nats.js';
import {
	membership,
	groupMemberIds,
	groupVoicePerms,
	channelAccess,
	channelAccessMap,
} from '../permissions.js';
import { log } from '../log.js';

const db = createDb(config.databaseUrl);

// Per-group caps. Channels/categories are bounded so a single group can't
// sprawl the sidebar; the participant cap is the max number of people who can
// be connected to one voice channel at once.
const MAX_CHANNELS_PER_GROUP = 10;
const MAX_CATEGORIES_PER_GROUP = 10;
const MAX_CHANNEL_PARTICIPANTS = 15;

export const channelsRoutes = new Hono<AuthEnv>();
channelsRoutes.use('*', authMiddleware(config.jwtSecret));

// ─── List channels + categories in a group ─────────────────────
// Returns the flat `channels` array (every channel for this group, with its
// `categoryId`) plus a `categories` array sorted by position. The client
// groups them client-side; serving both shapes from one endpoint keeps the
// realtime patches simple (a single channel update only needs to mutate one
// list).

channelsRoutes.get('/channels', async (c) => {
	const me = c.get('user');
	const groupId = c.req.query('groupId');
	if (!groupId) return c.json({ error: 'groupId required' }, 400);

	const role = await membership(groupId, me.userId);
	if (!role) return c.json({ error: 'forbidden' }, 403);

	const [allRows, categories] = await Promise.all([
		db
			.select()
			.from(voiceChannels)
			.where(eq(voiceChannels.groupId, groupId))
			.orderBy(desc(voiceChannels.createdAt)),
		db
			.select()
			.from(voiceChannelCategories)
			.where(eq(voiceChannelCategories.groupId, groupId))
			.orderBy(asc(voiceChannelCategories.position), asc(voiceChannelCategories.createdAt)),
	]);

	// Filter out channels the caller can't see. Bulk-resolve access in one
	// pass so we don't fire one query per channel.
	const accessByChannel = await channelAccessMap(
		groupId,
		me.userId,
		allRows.map((r) => r.id),
		role,
	);
	const rows = allRows.filter((r) => accessByChannel.get(r.id)?.visible === true);

	// Join LiveKit's live participant set against our user_cache so the sidebar
	// can show avatars + names for who's currently in each channel without the
	// client having to do its own LiveKit query.
	const channelIds = rows.map((r) => r.id);
	const participantsByChannel = await listActiveParticipants(channelIds);

	const allUserIds = Array.from(
		new Set([...participantsByChannel.values()].flat().map((p) => p.identity)),
	);
	const userMap = new Map<string, { id: string; username: string; displayName: string | null; avatarUrl: string | null }>();
	if (allUserIds.length > 0) {
		const users = await db
			.select({
				id: userCache.id,
				username: userCache.username,
				displayName: userCache.displayName,
				avatarUrl: userCache.avatarUrl,
			})
			.from(userCache)
			.where(inArray(userCache.id, allUserIds));
		for (const u of users) userMap.set(u.id, u);
	}

	const channelsWithParticipants = rows.map((r) => {
		const states = participantsByChannel.get(r.id) ?? [];
		// If a participant isn't in user_cache yet (e.g. NATS event lag), still
		// surface them with their userId as a fallback name so the sidebar
		// doesn't silently drop heads.
		const participants = states.map((s) => {
			const u = userMap.get(s.identity);
			return {
				userId: s.identity,
				username: u?.username ?? s.identity,
				displayName: u?.displayName ?? null,
				avatarUrl: u?.avatarUrl ?? null,
				micMuted: s.micMuted,
				deafened: s.deafened,
				sharing: s.sharing,
			};
		});
		return { ...r, participants };
	});

	return c.json({ channels: channelsWithParticipants, categories });
});

// ─── Create channel ─────────────────────────────────────────────

channelsRoutes.post('/channels', async (c) => {
	const me = c.get('user');
	const body = await c.req.json().catch(() => ({}));
	const groupId = String(body?.groupId ?? '');
	const name = String(body?.name ?? '').trim();
	const rawCategoryId = body?.categoryId;
	const categoryId = rawCategoryId == null ? null : String(rawCategoryId);

	if (!groupId || !name) return c.json({ error: 'groupId and name required' }, 400);
	if (name.length > 64) return c.json({ error: 'name too long' }, 400);

	const perms = await groupVoicePerms(groupId, me.userId);
	if (!perms.manageChannels) return c.json({ error: 'forbidden' }, 403);

	const [{ total }] = await db
		.select({ total: count() })
		.from(voiceChannels)
		.where(eq(voiceChannels.groupId, groupId));
	if (Number(total) >= MAX_CHANNELS_PER_GROUP) {
		return c.json({ error: `channel limit reached (max ${MAX_CHANNELS_PER_GROUP})` }, 409);
	}

	if (categoryId) {
		const [cat] = await db
			.select({ id: voiceChannelCategories.id, groupId: voiceChannelCategories.groupId })
			.from(voiceChannelCategories)
			.where(eq(voiceChannelCategories.id, categoryId))
			.limit(1);
		if (!cat || cat.groupId !== groupId) {
			return c.json({ error: 'invalid categoryId' }, 400);
		}
	}

	try {
		const [row] = await db.insert(voiceChannels).values({
			groupId,
			categoryId,
			name,
			createdBy: me.userId,
		}).returning();

		const targetUserIds = await groupMemberIds(groupId);
		publishVoiceChannelCreated({
			targetUserIds,
			channel: {
				id: row.id,
				groupId: row.groupId,
				categoryId: row.categoryId,
				name: row.name,
				createdBy: row.createdBy,
				createdAt: row.createdAt.toISOString(),
			},
		}).catch((err) => {
			log.warn({ err }, 'publishVoiceChannelCreated failed');
		});

		return c.json({ channel: row }, 201);
	} catch {
		return c.json({ error: 'channel name already exists' }, 409);
	}
});

// ─── Update channel (rename or move between categories) ─────────

channelsRoutes.patch('/channels/:id', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const body = await c.req.json().catch(() => ({}));

	const [ch] = await db.select().from(voiceChannels).where(eq(voiceChannels.id, id)).limit(1);
	if (!ch) return c.json({ error: 'not found' }, 404);

	const perms = await groupVoicePerms(ch.groupId, me.userId);
	if (!perms.manageChannels) return c.json({ error: 'forbidden' }, 403);

	const patch: Partial<{ name: string; categoryId: string | null }> = {};
	if (body?.name !== undefined) {
		const name = String(body.name).trim();
		if (!name) return c.json({ error: 'name cannot be empty' }, 400);
		if (name.length > 64) return c.json({ error: 'name too long' }, 400);
		patch.name = name;
	}
	if (body?.categoryId !== undefined) {
		const next = body.categoryId === null ? null : String(body.categoryId);
		if (next !== null) {
			const [cat] = await db
				.select({ groupId: voiceChannelCategories.groupId })
				.from(voiceChannelCategories)
				.where(eq(voiceChannelCategories.id, next))
				.limit(1);
			if (!cat || cat.groupId !== ch.groupId) {
				return c.json({ error: 'invalid categoryId' }, 400);
			}
		}
		patch.categoryId = next;
	}
	if (Object.keys(patch).length === 0) return c.json({ error: 'nothing to update' }, 400);

	try {
		await db.update(voiceChannels).set(patch).where(eq(voiceChannels.id, id));
	} catch {
		return c.json({ error: 'channel name already exists' }, 409);
	}

	const targetUserIds = await groupMemberIds(ch.groupId);
	publishVoiceChannelUpdated({
		targetUserIds,
		groupId: ch.groupId,
		channelId: id,
		patch,
	}).catch((err) => {
		log.warn({ err }, 'publishVoiceChannelUpdated failed');
	});

	return c.json({ success: true, patch });
});

// ─── Categories CRUD ────────────────────────────────────────────

channelsRoutes.post('/categories', async (c) => {
	const me = c.get('user');
	const body = await c.req.json().catch(() => ({}));
	const groupId = String(body?.groupId ?? '');
	const name = String(body?.name ?? '').trim();

	if (!groupId || !name) return c.json({ error: 'groupId and name required' }, 400);
	if (name.length > 64) return c.json({ error: 'name too long' }, 400);

	const perms = await groupVoicePerms(groupId, me.userId);
	if (!perms.manageChannels) return c.json({ error: 'forbidden' }, 403);

	const [{ total }] = await db
		.select({ total: count() })
		.from(voiceChannelCategories)
		.where(eq(voiceChannelCategories.groupId, groupId));
	if (Number(total) >= MAX_CATEGORIES_PER_GROUP) {
		return c.json({ error: `category limit reached (max ${MAX_CATEGORIES_PER_GROUP})` }, 409);
	}

	// New categories sort to the bottom by default — pick a position one
	// past the current max so existing ordering isn't disturbed.
	const [{ maxPosition }] = await db
		.select({ maxPosition: voiceChannelCategories.position })
		.from(voiceChannelCategories)
		.where(eq(voiceChannelCategories.groupId, groupId))
		.orderBy(desc(voiceChannelCategories.position))
		.limit(1)
		.then((rows) => rows.length > 0 ? rows : [{ maxPosition: -1 }]);
	const position = (maxPosition ?? -1) + 1;

	try {
		const [row] = await db.insert(voiceChannelCategories).values({
			groupId,
			name,
			position,
			createdBy: me.userId,
		}).returning();

		const targetUserIds = await groupMemberIds(groupId);
		publishVoiceCategoryCreated({
			targetUserIds,
			category: {
				id: row.id,
				groupId: row.groupId,
				name: row.name,
				position: row.position,
				createdBy: row.createdBy,
				createdAt: row.createdAt.toISOString(),
			},
		}).catch((err) => {
			log.warn({ err }, 'publishVoiceCategoryCreated failed');
		});

		return c.json({ category: row }, 201);
	} catch {
		return c.json({ error: 'category name already exists' }, 409);
	}
});

channelsRoutes.patch('/categories/:id', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const body = await c.req.json().catch(() => ({}));

	const [cat] = await db
		.select()
		.from(voiceChannelCategories)
		.where(eq(voiceChannelCategories.id, id))
		.limit(1);
	if (!cat) return c.json({ error: 'not found' }, 404);

	const perms = await groupVoicePerms(cat.groupId, me.userId);
	if (!perms.manageChannels) return c.json({ error: 'forbidden' }, 403);

	const patch: Partial<{ name: string; position: number }> = {};
	if (body?.name !== undefined) {
		const name = String(body.name).trim();
		if (!name) return c.json({ error: 'name cannot be empty' }, 400);
		if (name.length > 64) return c.json({ error: 'name too long' }, 400);
		patch.name = name;
	}
	if (body?.position !== undefined) {
		const pos = Number(body.position);
		if (!Number.isInteger(pos) || pos < 0) return c.json({ error: 'invalid position' }, 400);
		patch.position = pos;
	}
	if (Object.keys(patch).length === 0) return c.json({ error: 'nothing to update' }, 400);

	try {
		await db.update(voiceChannelCategories).set(patch).where(eq(voiceChannelCategories.id, id));
	} catch {
		return c.json({ error: 'category name already exists' }, 409);
	}

	const targetUserIds = await groupMemberIds(cat.groupId);
	publishVoiceCategoryUpdated({
		targetUserIds,
		groupId: cat.groupId,
		categoryId: id,
		patch,
	}).catch((err) => {
		log.warn({ err }, 'publishVoiceCategoryUpdated failed');
	});

	return c.json({ success: true, patch });
});

channelsRoutes.delete('/categories/:id', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');

	const [cat] = await db
		.select()
		.from(voiceChannelCategories)
		.where(eq(voiceChannelCategories.id, id))
		.limit(1);
	if (!cat) return c.json({ error: 'not found' }, 404);

	const perms = await groupVoicePerms(cat.groupId, me.userId);
	if (!perms.manageChannels) return c.json({ error: 'forbidden' }, 403);

	// Orphan child channels (set categoryId = null) rather than cascading. We
	// emit a channel_updated event for each so subscribers can repaint without
	// a re-fetch. SET NULL on FK would do this implicitly, but we keep it
	// explicit so the published events line up with the final DB state.
	const orphans = await db
		.select({ id: voiceChannels.id })
		.from(voiceChannels)
		.where(eq(voiceChannels.categoryId, id));

	if (orphans.length > 0) {
		await db
			.update(voiceChannels)
			.set({ categoryId: null })
			.where(eq(voiceChannels.categoryId, id));
	}

	await db.delete(voiceChannelCategories).where(eq(voiceChannelCategories.id, id));

	const targetUserIds = await groupMemberIds(cat.groupId);

	for (const orphan of orphans) {
		publishVoiceChannelUpdated({
			targetUserIds,
			groupId: cat.groupId,
			channelId: orphan.id,
			patch: { categoryId: null },
		}).catch((err) => {
			log.warn({ err }, 'publishVoiceChannelUpdated (orphan) failed');
		});
	}

	publishVoiceCategoryDeleted({
		targetUserIds,
		groupId: cat.groupId,
		categoryId: id,
	}).catch((err) => {
		log.warn({ err }, 'publishVoiceCategoryDeleted failed');
	});

	return c.json({ success: true });
});

// ─── Delete channel ─────────────────────────────────────────────

channelsRoutes.delete('/channels/:id', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');

	const [ch] = await db.select().from(voiceChannels).where(eq(voiceChannels.id, id)).limit(1);
	if (!ch) return c.json({ error: 'not found' }, 404);

	const perms = await groupVoicePerms(ch.groupId, me.userId);
	if (!perms.manageChannels) return c.json({ error: 'forbidden' }, 403);

	await db.delete(voiceChannels).where(eq(voiceChannels.id, id));

	// Forcibly tear down the LiveKit room so any connected callers are kicked
	// at the media layer. The WS event below also tells clients to leave the
	// channel page; together these two cover both "in-call" and "viewing the
	// page without an active connection."
	await deleteRoom(ch.id);

	const targetUserIds = await groupMemberIds(ch.groupId);
	publishVoiceChannelDeleted({
		targetUserIds,
		groupId: ch.groupId,
		channelId: ch.id,
	}).catch((err) => {
		log.warn({ err }, 'publishVoiceChannelDeleted failed');
	});

	return c.json({ success: true });
});

// ─── Join channel — issue LiveKit token ─────────────────────────

// ─── Realtime presence helpers ──────────────────────────────────
// These endpoints fan out NATS events so other group members see channel
// joins/leaves and mic/headphones changes in real time. They cover graceful
// transitions only; hard exits (closed tab, dead network) are reported by
// LiveKit itself through the webhook receiver, which publishes the same events.

async function buildAndPublishVoiceEvent(
	channelId: string,
	userId: string,
	kind: VoiceParticipantEvent['kind'],
	state: { micMuted: boolean; deafened: boolean; sharing: boolean },
): Promise<{ ok: true } | { ok: false; status: 403 | 404 }> {
	const [ch] = await db.select().from(voiceChannels).where(eq(voiceChannels.id, channelId)).limit(1);
	if (!ch) return { ok: false, status: 404 };

	const role = await membership(ch.groupId, userId);
	if (!role) return { ok: false, status: 403 };

	// A user who can't see the channel can't fan out presence into it either.
	const access = await channelAccess(channelId, ch.groupId, userId, role);
	if (!access.visible) return { ok: false, status: 403 };

	await fanOutParticipantEvent({ channelId, userId, kind, state });
	return { ok: true };
}

// Single endpoint covering join/leave/state. The body's `kind` discriminates;
// `micMuted`/`deafened` ride along on every event so subscribers can hydrate
// the participant row without a second roundtrip.
channelsRoutes.post('/channels/:id/presence', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');
	const body = await c.req.json().catch(() => ({}));
	const kind = body?.kind;
	if (kind !== 'joined' && kind !== 'left' && kind !== 'updated') {
		return c.json({ error: 'invalid kind' }, 400);
	}
	const micMuted = Boolean(body?.micMuted);
	const deafened = Boolean(body?.deafened);
	const sharing = Boolean(body?.sharing);

	const result = await buildAndPublishVoiceEvent(id, me.userId, kind, { micMuted, deafened, sharing });
	if (!result.ok) return c.json({ error: 'forbidden' }, result.status);
	return c.json({ success: true });
});

channelsRoutes.post('/channels/:id/join', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');

	const [ch] = await db.select().from(voiceChannels).where(eq(voiceChannels.id, id)).limit(1);
	if (!ch) return c.json({ error: 'not found' }, 404);

	const role = await membership(ch.groupId, me.userId);
	if (!role) return c.json({ error: 'forbidden' }, 403);

	// Per-channel access: hidden/no-CONNECT roles get a 403. SPEAK/CAN_SHARE are
	// enforced at the LiveKit token layer below so even a tampered client cannot
	// publish a source it wasn't granted.
	const access = await channelAccess(id, ch.groupId, me.userId, role);
	if (!access.visible || !access.canConnect) return c.json({ error: 'forbidden' }, 403);

	// Capacity check. LiveKit's live participant set is the source of truth for
	// "who's connected right now." A user already in the room (e.g. reconnecting
	// or opening a second device) doesn't count against the cap — otherwise a
	// flaky connection could lock them out of their own channel.
	const liveByChannel = await listActiveParticipants([id]);
	const live = liveByChannel.get(id) ?? [];
	const alreadyIn = live.some((p) => p.identity === me.userId);
	if (!alreadyIn && live.length >= MAX_CHANNEL_PARTICIPANTS) {
		return c.json({ error: `channel is full (max ${MAX_CHANNEL_PARTICIPANTS})` }, 409);
	}

	const [u] = await db
		.select({ username: userCache.username, displayName: userCache.displayName })
		.from(userCache)
		.where(eq(userCache.id, me.userId))
		.limit(1);
	const displayName = u?.displayName ?? u?.username ?? me.userId;

	const token = await createJoinToken({
		channelId: id,
		userId: me.userId,
		displayName,
		canSpeak: access.canSpeak,
		canShare: access.canShare,
	});

	return c.json({
		url: config.livekitPublicUrl,
		token,
		channel: ch,
		// Surfaced so the client can hide the screen-share control when the
		// user's role doesn't grant it (the token enforces it regardless).
		canShare: access.canShare,
	});
});

// ─── Screen-share sidecar token ────────────────────────────────
// Only iOS asks for this. Its ReplayKit broadcast extension delivers frames to
// the native process, which cannot reach the webview's WebRTC stack, so the
// share is published over a second LiveKit connection under `<userId>#screen`.
// See `screenIdentity` in ../livekit.ts for why it needs its own identity.
//
// Deliberately not folded into the join response: a token lives five minutes,
// and the user may present an hour into a call.

channelsRoutes.post('/channels/:id/screen-token', async (c) => {
	const me = c.get('user');
	const id = c.req.param('id');

	const [ch] = await db.select().from(voiceChannels).where(eq(voiceChannels.id, id)).limit(1);
	if (!ch) return c.json({ error: 'not found' }, 404);

	const role = await membership(ch.groupId, me.userId);
	if (!role) return c.json({ error: 'forbidden' }, 403);

	const access = await channelAccess(id, ch.groupId, me.userId, role);
	if (!access.visible || !access.canConnect) return c.json({ error: 'forbidden' }, 403);
	// Unlike join, CAN_SHARE is a hard gate here rather than a token detail:
	// there is no reason to hand out a publish-only token to someone who may
	// not publish.
	if (!access.canShare) return c.json({ error: 'forbidden' }, 403);

	// No capacity check: the sidecar is not a participant, and the user whose
	// screen it carries already holds a slot.

	const [u] = await db
		.select({ username: userCache.username, displayName: userCache.displayName })
		.from(userCache)
		.where(eq(userCache.id, me.userId))
		.limit(1);
	const displayName = u?.displayName ?? u?.username ?? me.userId;

	const token = await createScreenToken({ channelId: id, userId: me.userId, displayName });

	return c.json({ url: config.livekitPublicUrl, token });
});
