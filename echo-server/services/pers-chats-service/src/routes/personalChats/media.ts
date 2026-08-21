/**
 * The read-only views over a chat's history: search, counters, and the media
 * gallery. All three run SQL over `attachments_meta` rather than decrypting
 * every row — see `@echo/shared/crypto`.
 */
import { Hono } from 'hono';
import {
	and,
	db,
	decryptRow,
	eq,
	getReactionsForMessages,
	inArray,
	log,
	lt,
	or,
	personalChats,
	personalMessageDeletions,
	personalMessages,
	sql,
	type AuthEnv,
} from './shared.js';

export const routes = new Hono<AuthEnv>();

// Get aggregate stats for a chat (messages count + attachment counts by kind)
// Search messages within a chat using the plaintext tsvector index.
// Returns most-recent matches first, paginated by createdAt.
routes.get('/:chatId/search', async (c) => {
	const currentUserId = c.get('user').userId;
	const chatId = c.req.param('chatId');
	const q = (c.req.query('q') ?? '').trim();
	const cursor = c.req.query('cursor');
	const limit = Math.min(Number(c.req.query('limit')) || 30, 100);

	if (!q) return c.json({ messages: [], hasMore: false, nextCursor: null });

	const chat = await db.query.personalChats.findFirst({
		where: and(
			eq(personalChats.id, chatId),
			or(eq(personalChats.user1Id, currentUserId), eq(personalChats.user2Id, currentUserId)),
		),
	});
	if (!chat) return c.json({ error: 'Chat not found' }, 404);

	const deletedRows = await db.query.personalMessageDeletions.findMany({
		where: eq(personalMessageDeletions.userId, currentUserId),
		columns: { messageId: true },
	});
	const deletedSet = new Set(deletedRows.map((d) => d.messageId));

	const cursorDate = cursor ? new Date(cursor) : null;
	const conds = [
		eq(personalMessages.chatId, chatId),
		sql`${personalMessages.contentSearch} @@ plainto_tsquery('simple', ${q})`,
	];
	if (cursorDate) conds.push(lt(personalMessages.createdAt, cursorDate));

	const rowsRaw = await db.query.personalMessages.findMany({
		where: and(...conds),
		orderBy: (m, { desc }) => [desc(m.createdAt)],
		limit: limit + 1,
		with: {
			author: {
				columns: { id: true, username: true, displayName: true, avatarUrl: true },
			},
		},
	});

	const hasMore = rowsRaw.length > limit;
	const page = hasMore ? rowsRaw.slice(0, limit) : rowsRaw;
	const visible = page.filter((r) => !deletedSet.has(r.id));
	const searchReactions = await getReactionsForMessages(visible.map((r) => r.id));
	const messages = visible.map((r) => {
		const decrypted = decryptRow(r as any);
		return {
			id: r.id,
			chatId: r.chatId,
			authorId: r.authorId,
			content: decrypted.content,
			attachments: decrypted.attachments,
			createdAt: r.createdAt,
			author: r.author,
			reactions: searchReactions[r.id] ?? [],
		};
	});

	return c.json({
		messages,
		hasMore,
		nextCursor: hasMore && page.length > 0 ? page[page.length - 1].createdAt.toISOString() : null,
	});
});

routes.get('/:chatId/stats', async (c) => {
	const currentUserId = c.get('user').userId;
	const chatId = c.req.param('chatId');

	const chat = await db.query.personalChats.findFirst({
		where: and(
			eq(personalChats.id, chatId),
			or(eq(personalChats.user1Id, currentUserId), eq(personalChats.user2Id, currentUserId)),
		),
	});
	if (!chat) return c.json({ error: 'Chat not found' }, 404);

	// `files` deliberately excludes audio: audio attachments are their own
	// category now (played inline rather than downloaded), so counting them in
	// both buckets would double up.
	const result = await db.execute(sql`
		SELECT
			(SELECT COUNT(*)::int FROM personal_messages WHERE chat_id = ${chatId}) AS messages,
			(SELECT COUNT(*)::int FROM personal_message_links WHERE chat_id = ${chatId}) AS links,
			COALESCE(SUM(CASE WHEN att->>'mimeType' LIKE 'image/%' AND att->>'mimeType' <> 'image/gif' THEN 1 ELSE 0 END), 0)::int AS photos,
			COALESCE(SUM(CASE WHEN att->>'mimeType' = 'image/gif' THEN 1 ELSE 0 END), 0)::int AS gifs,
			COALESCE(SUM(CASE WHEN att->>'mimeType' LIKE 'video/%' THEN 1 ELSE 0 END), 0)::int AS videos,
			COALESCE(SUM(CASE WHEN att->>'mimeType' LIKE 'audio/%' THEN 1 ELSE 0 END), 0)::int AS audio_total,
			COALESCE(SUM(CASE WHEN att->>'mimeType' NOT LIKE 'image/%' AND att->>'mimeType' NOT LIKE 'video/%' AND att->>'mimeType' NOT LIKE 'audio/%' THEN 1 ELSE 0 END), 0)::int AS files
		FROM personal_messages pm
		LEFT JOIN LATERAL jsonb_array_elements(COALESCE(pm.attachments_meta, pm.attachments)) att ON TRUE
		WHERE pm.chat_id = ${chatId}
	`);

	const row = (result as unknown as Array<{
		messages: number;
		links: number;
		photos: number;
		videos: number;
		files: number;
		gifs: number;
		audio_total: number;
	}>)[0];

	// Recorded voice notes and uploaded audio share the audio/* mime range and
	// are told apart by the attachment's `voice` payload — which lives inside
	// the ciphertext, not in attachments_meta. Decrypt just the messages that
	// carry audio (a small slice of any chat) and split the total there.
	const audioTotal = row?.audio_total ?? 0;
	let voiceMessages = 0;
	if (audioTotal > 0) {
		const audioMsgRows = await db.query.personalMessages.findMany({
			where: and(
				eq(personalMessages.chatId, chatId),
				sql`EXISTS (
					SELECT 1 FROM jsonb_array_elements(COALESCE(${personalMessages.attachmentsMeta}, ${personalMessages.attachments})) a
					WHERE a->>'mimeType' LIKE 'audio/%'
				)`,
			),
			columns: {
				id: true,
				content: true,
				attachments: true,
				replyToSnapshot: true,
				contentCiphertext: true,
				contentNonce: true,
				contentKeyId: true,
				attachmentsCiphertext: true,
				attachmentsNonce: true,
				attachmentsKeyId: true,
				replyToSnapshotCiphertext: true,
				replyToSnapshotNonce: true,
				replyToSnapshotKeyId: true,
			},
		});

		for (const m of audioMsgRows) {
			const dec = decryptRow(m as any);
			const list = Array.isArray(dec.attachments) ? (dec.attachments as Record<string, unknown>[]) : [];
			for (const a of list) {
				const mime = typeof a?.mimeType === 'string' ? a.mimeType : '';
				if (mime.startsWith('audio/') && a?.voice) voiceMessages++;
			}
		}
	}

	return c.json({
		messages: row?.messages ?? 0,
		links: row?.links ?? 0,
		photos: row?.photos ?? 0,
		videos: row?.videos ?? 0,
		files: row?.files ?? 0,
		gifs: row?.gifs ?? 0,
		audio: Math.max(0, audioTotal - voiceMessages),
		voiceMessages,
	});
});

// Paginated media listing for a chat. `kind` selects which attachment family
// to return; pagination uses a (createdAt, ord) cursor so we can stably page
// through individual attachments inside a message's JSON array.
routes.get('/:chatId/media', async (c) => {
	const currentUserId = c.get('user').userId;
	const chatId = c.req.param('chatId');
	const kind = c.req.query('kind') ?? 'photos';
	const cursor = c.req.query('cursor');
	const limit = Math.min(Number(c.req.query('limit')) || 30, 100);

	if (
		kind !== 'photos' && kind !== 'videos' && kind !== 'gifs' &&
		kind !== 'audio' && kind !== 'files' && kind !== 'links'
	) {
		return c.json({ error: 'Invalid kind' }, 400);
	}

	const chat = await db.query.personalChats.findFirst({
		where: and(
			eq(personalChats.id, chatId),
			or(eq(personalChats.user1Id, currentUserId), eq(personalChats.user2Id, currentUserId)),
		),
	});
	if (!chat) return c.json({ error: 'Chat not found' }, 404);

	// ── Links branch — reads from the dedicated links table ──
	if (kind === 'links') {
		let cursorId: number | null = null;
		if (cursor) cursorId = Number(cursor) || null;

		const cursorFilter = cursorId !== null
			? sql`AND l.id < ${cursorId}`
			: sql.empty();

		let linkResult;
		try {
			linkResult = await db.execute(sql`
				SELECT l.id, l.message_id, l.url, l.created_at
				FROM personal_message_links l
				WHERE l.chat_id = ${chatId}
					${cursorFilter}
				ORDER BY l.created_at DESC, l.id DESC
				LIMIT ${limit + 1}
			`);
		} catch (err) {
			log.error({ err }, 'links query failed');
			return c.json({ error: 'Failed to load links' }, 500);
		}

		const linkRows = linkResult as unknown as Array<{
			id: number;
			message_id: string;
			url: string;
			created_at: Date | string;
		}>;

		const hasMore = linkRows.length > limit;
		if (hasMore) linkRows.pop();

		const tsToStr = (t: Date | string): string =>
			t instanceof Date ? t.toISOString() : t;

		const items = linkRows.map((r) => ({
			id: r.id,
			messageId: r.message_id,
			createdAt: tsToStr(r.created_at),
			url: r.url,
		}));

		const last = linkRows[linkRows.length - 1];
		const nextCursor = hasMore && last ? String(last.id) : null;

		return c.json({ items, hasMore, nextCursor });
	}

	// ── Attachment-based kinds ──
	// `files` is documents only — audio has its own kind, matching how the stats
	// endpoint buckets them and how the chat renders them.
	const mimeFilter = kind === 'photos'
		? sql`att.value->>'mimeType' LIKE 'image/%' AND att.value->>'mimeType' <> 'image/gif'`
		: kind === 'gifs'
			? sql`att.value->>'mimeType' = 'image/gif'`
			: kind === 'videos'
				? sql`att.value->>'mimeType' LIKE 'video/%'`
				: kind === 'audio'
					? sql`att.value->>'mimeType' LIKE 'audio/%'`
					: sql`att.value->>'mimeType' NOT LIKE 'image/%' AND att.value->>'mimeType' NOT LIKE 'video/%' AND att.value->>'mimeType' NOT LIKE 'audio/%'`;

	// Cursor format: `${pgTimestampString}|${ord}`. We deliberately keep the
	// timestamp as a raw string and cast it with ::timestamp on the SQL side —
	// round-tripping through JS Date loses microseconds and is ambiguous for
	// Postgres "timestamp without time zone" values.
	let cursorTimestamp: string | null = null;
	let cursorOrd: number | null = null;
	if (cursor) {
		const sep = cursor.lastIndexOf('|');
		if (sep > 0) {
			const tsPart = cursor.slice(0, sep).trim();
			const ord = Number(cursor.slice(sep + 1));
			if (tsPart && Number.isFinite(ord)) {
				cursorTimestamp = tsPart;
				cursorOrd = ord;
			}
		}
	}

	const cursorFilter = cursorTimestamp !== null && cursorOrd !== null
		? sql`AND (pm.created_at < ${cursorTimestamp}::timestamp OR (pm.created_at = ${cursorTimestamp}::timestamp AND att.ord > ${cursorOrd}))`
		: sql.empty();

	let result;
	try {
		result = await db.execute(sql`
			SELECT
				pm.id AS message_id,
				pm.created_at AS created_at,
				att.ord AS ord,
				att.value AS attachment
			FROM personal_messages pm
			CROSS JOIN LATERAL jsonb_array_elements(COALESCE(pm.attachments_meta, pm.attachments)) WITH ORDINALITY att(value, ord)
			WHERE pm.chat_id = ${chatId}
				AND (${mimeFilter})
				${cursorFilter}
			ORDER BY pm.created_at DESC, att.ord ASC
			LIMIT ${limit + 1}
		`);
	} catch (err) {
		log.error({ err }, 'media query failed');
		return c.json({ error: 'Failed to load media' }, 500);
	}

	// `att.value` is whatever COALESCE picked. For encrypted rows that is the
	// attachments_meta projection — hash/mimeType/size only, enough to filter
	// and paginate on but not to render: url, filename and id live inside the
	// ciphertext. Legacy plaintext rows already carry the full attachment.
	const rows = result as unknown as Array<{
		message_id: string;
		created_at: Date | string;
		ord: number | bigint | string;
		attachment: Record<string, unknown>;
	}>;

	const hasMore = rows.length > limit;
	if (hasMore) rows.pop();

	const tsToString = (t: Date | string): string =>
		t instanceof Date ? t.toISOString() : t;

	// Decrypt once per message, then resolve each row's attachment out of the
	// plaintext array. Matched by hash rather than by ordinal: metaFromAttachments
	// drops entries without one, so the two arrays are not guaranteed to line up.
	const messageIds = [...new Set(rows.map((r) => r.message_id))];
	const decryptedByMessage = new Map<string, Record<string, unknown>[]>();
	const metaByMessage = new Map<string, Record<string, unknown>[]>();
	if (messageIds.length > 0) {
		const msgRows = await db.query.personalMessages.findMany({
			where: inArray(personalMessages.id, messageIds),
			columns: {
				id: true,
				content: true,
				attachments: true,
				attachmentsMeta: true,
				replyToSnapshot: true,
				contentCiphertext: true,
				contentNonce: true,
				contentKeyId: true,
				attachmentsCiphertext: true,
				attachmentsNonce: true,
				attachmentsKeyId: true,
				replyToSnapshotCiphertext: true,
				replyToSnapshotNonce: true,
				replyToSnapshotKeyId: true,
			},
		});
		for (const m of msgRows) {
			const dec = decryptRow(m as any);
			decryptedByMessage.set(
				m.id,
				Array.isArray(dec.attachments) ? (dec.attachments as Record<string, unknown>[]) : [],
			);
			metaByMessage.set(
				m.id,
				Array.isArray(m.attachmentsMeta) ? (m.attachmentsMeta as Record<string, unknown>[]) : [],
			);
		}
	}

	const items = rows
		.map((r) => {
			const meta = r.attachment ?? {};
			// Already a full attachment (legacy plaintext row) — nothing to resolve.
			let attachment: Record<string, unknown> | undefined =
				typeof meta.url === 'string' ? meta : undefined;

			if (!attachment) {
				const list = decryptedByMessage.get(r.message_id) ?? [];
				if (typeof meta.hash === 'string') {
					// A message can carry the same file twice, and both meta entries
					// then share a hash. Matching on the hash alone hands every copy
					// the *first* plaintext entry, so the page comes back with the
					// same attachment id repeated. Pair the Nth meta entry with the
					// Nth plaintext entry of that hash instead. Ranking off the full
					// meta array (rather than the rows in this page) keeps the answer
					// stable when a message straddles a page boundary.
					const metaList = metaByMessage.get(r.message_id) ?? [];
					const ordIdx = Number(r.ord) - 1;
					let rank = 0;
					for (let i = 0; i < ordIdx && i < metaList.length; i++) {
						if (metaList[i]?.hash === meta.hash) rank++;
					}
					let seen = 0;
					attachment = list.find((a) => a?.hash === meta.hash && seen++ === rank);
				} else {
					attachment = list[Number(r.ord) - 1];
				}
			}
			if (!attachment) return null;
			// The audio tab lists uploads only — recorded voice notes are counted
			// and surfaced separately. The `voice` flag is only visible once the
			// attachment has been decrypted, so this filter has to run here rather
			// than in the SQL predicate; a page may come back short as a result and
			// the caller simply pages again.
			if (kind === 'audio' && attachment.voice) return null;

			return {
				messageId: r.message_id,
				createdAt: tsToString(r.created_at),
				attachment,
			};
		})
		.filter((it): it is NonNullable<typeof it> => it !== null);

	const last = rows[rows.length - 1];
	const nextCursor = hasMore && last
		? `${tsToString(last.created_at)}|${Number(last.ord)}`
		: null;

	return c.json({ items, hasMore, nextCursor });
});
