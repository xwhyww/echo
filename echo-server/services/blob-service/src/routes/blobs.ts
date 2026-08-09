import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { eq, and, sql } from 'drizzle-orm';
import { authMiddleware, verifyToken, type AuthEnv, type JwtPayload } from '@echo/shared';
import { createDb } from '../db/index.js';
import { fileBlobs, rawBlobMap, blobGrants, dmChatMembers, groupMembersMirror } from '../db/schema.js';
import { config } from '../config.js';
import { randomUUID, createHash } from 'crypto';
import { mkdir, unlink } from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import os from 'os';
import { compressImage, compressVideo } from '../media.js';
import { gcIfOrphan as gcIfOrphanShared } from '../gc.js';
import { storage } from '../storage.js';

const db = createDb(config.databaseUrl);

// ffmpeg works on real files, so video transcodes go through a local tmp dir
// regardless of the storage driver; the finished file is then moved/uploaded.
const TMP_DIR = path.join(os.tmpdir(), 'echo-blob-tmp');

const ALLOWED_FILE_TYPES = [
	'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
	'application/pdf',
	'video/mp4', 'video/webm', 'video/quicktime',
	'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
	'application/zip', 'application/x-rar-compressed',
	'text/plain',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_FILES_PER_UPLOAD = 10;

type ScopeType = 'chat' | 'avatar' | 'pending' | 'group';

function hashBuffer(buf: Buffer): string {
	return createHash('sha256').update(buf).digest('hex');
}

function hashFilePath(p: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const h = createHash('sha256');
		createReadStream(p)
			.on('data', (c) => h.update(c as Buffer))
			.on('end', () => resolve(h.digest('hex')))
			.on('error', reject);
	});
}

function isValidScopeType(s: unknown): s is ScopeType {
	return s === 'chat' || s === 'avatar' || s === 'pending' || s === 'group';
}

// Verify the authenticated user can attach blobs to this scope.
async function canWriteScope(userId: string, scopeType: ScopeType, scopeId: string): Promise<boolean> {
	if (scopeType === 'pending') return scopeId === userId;
	if (scopeType === 'avatar') {
		// Your own face, or a group's — a group avatar is scoped to the *group*
		// rather than to whoever uploaded it, so replacing it revokes one
		// unambiguous grant no matter which admin set the previous picture.
		// `avatar` reads are public (see `canReadScope`), which a group avatar
		// needs: it shows on invite cards and in public group listings, to
		// people who are not members yet.
		//
		// Membership is the bar here, not the group's edit-info policy —
		// groups-service is the one that decides whose upload actually becomes
		// the group's picture. A blob nothing points at is garbage-collected.
		if (scopeId === userId) return true;
		const row = await db.query.groupMembersMirror.findFirst({
			where: and(eq(groupMembersMirror.groupId, scopeId), eq(groupMembersMirror.userId, userId)),
		});
		return !!row;
	}
	if (scopeType === 'chat') {
		const row = await db.query.dmChatMembers.findFirst({
			where: and(eq(dmChatMembers.chatId, scopeId), eq(dmChatMembers.userId, userId)),
		});
		return !!row;
	}
	if (scopeType === 'group') {
		const row = await db.query.groupMembersMirror.findFirst({
			where: and(eq(groupMembersMirror.groupId, scopeId), eq(groupMembersMirror.userId, userId)),
		});
		return !!row;
	}
	return false;
}

// Verify the authenticated user can read blobs reachable from this scope.
async function canReadScope(userId: string, scopeType: string, scopeId: string): Promise<boolean> {
	if (scopeType === 'avatar') return true;
	if (scopeType === 'pending') return scopeId === userId;
	if (scopeType === 'chat') {
		const row = await db.query.dmChatMembers.findFirst({
			where: and(eq(dmChatMembers.chatId, scopeId), eq(dmChatMembers.userId, userId)),
		});
		return !!row;
	}
	if (scopeType === 'group') {
		const row = await db.query.groupMembersMirror.findFirst({
			where: and(eq(groupMembersMirror.groupId, scopeId), eq(groupMembersMirror.userId, userId)),
		});
		return !!row;
	}
	return false;
}

const gcIfOrphan = (hash: string) => gcIfOrphanShared(db, hash);

export const blobRoutes = new Hono<AuthEnv>();

function readAuthCookie(header: string | undefined): string | null {
	if (!header) return null;
	for (const part of header.split(';')) {
		const [k, ...rest] = part.trim().split('=');
		if (k === 'echo_auth') return decodeURIComponent(rest.join('='));
	}
	return null;
}

// /files/:storedName uses its own auth path: <img> and <video> tags can't
// send an Authorization header, so this route accepts (in order) the bearer
// header, an `echo_auth` cookie (browser-friendly, HttpOnly when set), and
// finally ?t=<jwt> as a Tauri fallback. All other routes go through the
// standard bearer middleware.
blobRoutes.use('*', async (c, next) => {
	if (c.req.method === 'GET' && c.req.path.startsWith('/blobs/files/')) {
		const header = c.req.header('Authorization');
		let token: string | null = null;
		if (header?.startsWith('Bearer ')) token = header.slice(7);
		if (!token) token = readAuthCookie(c.req.header('cookie'));
		if (!token) token = c.req.query('t') ?? null;

		const payload = token ? verifyToken(token, config.jwtSecret) : null;
		if (!payload) return c.json({ error: 'Unauthorized' }, 401);
		c.set('user', payload as JwtPayload);
		return next();
	}
	return authMiddleware(config.jwtSecret)(c, next);
});

// Authenticated file fetch. Replaces the old serveStatic mount: every read
// goes through scope-based authorization against the blob's grants.
blobRoutes.get('/files/:storedName', async (c) => {
	const userId = c.get('user').userId;
	const storedName = c.req.param('storedName');

	// stored names are `${hash}.${ext}` for the original or `${hash}_thumb.webp`
	// for the pre-generated 200px thumbnail. The hash prefix is the auth key
	// either way — both variants share the same grants.
	if (storedName.includes('/') || storedName.includes('\\') || storedName.includes('..')) {
		return c.json({ error: 'Invalid name' }, 400);
	}
	const nameMatch = /^([a-f0-9]{64})(_thumb)?\.[a-z0-9]+$/i.exec(storedName);
	if (!nameMatch) {
		return c.json({ error: 'Invalid name' }, 400);
	}
	const hash = nameMatch[1];
	const isThumb = !!nameMatch[2];

	const blob = await db.query.fileBlobs.findFirst({ where: eq(fileBlobs.hash, hash) });
	if (!blob) {
		return c.json({ error: 'Not found' }, 404);
	}
	if (isThumb) {
		if (!blob.thumbStoredName || blob.thumbStoredName !== storedName) {
			return c.json({ error: 'Not found' }, 404);
		}
	} else if (blob.storedName !== storedName) {
		return c.json({ error: 'Not found' }, 404);
	}

	const grants = await db.query.blobGrants.findMany({
		where: eq(blobGrants.fileHash, hash),
	});
	if (grants.length === 0) {
		return c.json({ error: 'Not found' }, 404);
	}

	let allowed = false;
	for (const g of grants) {
		if (await canReadScope(userId, g.scopeType, g.scopeId)) {
			allowed = true;
			break;
		}
	}
	if (!allowed) {
		return c.json({ error: 'Forbidden' }, 403);
	}

	const st = await storage.stat(storedName);
	if (!st) return c.json({ error: 'Not found' }, 404);

	// Distinct ETag for the thumb so a client switching between sizes doesn't
	// reuse the wrong cached body.
	const etag = `"${hash}${isThumb ? '-thumb' : ''}"`;
	if (c.req.header('if-none-match') === etag) {
		c.header('ETag', etag);
		c.header('Cache-Control', 'private, max-age=31536000, immutable');
		return c.body(null, 304);
	}

	c.header('Content-Type', isThumb ? 'image/webp' : blob.mimeType);
	c.header('ETag', etag);
	c.header('Cache-Control', 'private, max-age=31536000, immutable');
	c.header('Accept-Ranges', 'bytes');

	const range = c.req.header('range');
	if (range) {
		const m = /^bytes=(\d*)-(\d*)$/.exec(range);
		if (m) {
			const start = m[1] ? parseInt(m[1], 10) : 0;
			const end = m[2] ? parseInt(m[2], 10) : st.size - 1;
			if (start >= 0 && end < st.size && start <= end) {
				c.header('Content-Range', `bytes ${start}-${end}/${st.size}`);
				c.header('Content-Length', String(end - start + 1));
				c.status(206);
				const body = await storage.read(storedName, { start, end });
				return stream(c, async (s) => {
					await s.pipe(body);
				});
			}
		}
	}

	c.header('Content-Length', String(st.size));
	const body = await storage.read(storedName);
	return stream(c, async (s) => {
		await s.pipe(body);
	});
});

// Upload files. Compresses images/videos, deduplicates by content hash, and
// records a grant binding the resulting blob to the requested scope. Default
// scope is pending(userId) — used by chat upload before a chatId exists; the
// caller swaps it for a real scope on send.
blobRoutes.post('/upload', async (c) => {
	const userId = c.get('user').userId;
	const formData = await c.req.formData();
	const files = formData.getAll('files');
	const rawHashesRaw = formData.get('rawHashes');
	const rawHashes: string[] = rawHashesRaw ? JSON.parse(rawHashesRaw as string) : [];

	const scopeTypeRaw = (formData.get('scopeType') as string | null) ?? 'pending';
	const scopeIdRaw = (formData.get('scopeId') as string | null) ?? userId;
	if (!isValidScopeType(scopeTypeRaw)) {
		return c.json({ error: 'Invalid scopeType' }, 400);
	}
	const scopeType: ScopeType = scopeTypeRaw;
	const scopeId = scopeIdRaw;

	if (!(await canWriteScope(userId, scopeType, scopeId))) {
		return c.json({ error: 'Forbidden' }, 403);
	}

	if (!files.length) {
		return c.json({ error: 'No files provided' }, 400);
	}

	if (files.length > MAX_FILES_PER_UPLOAD) {
		return c.json({ error: `Maximum ${MAX_FILES_PER_UPLOAD} files allowed` }, 400);
	}

	await mkdir(TMP_DIR, { recursive: true });

	const blobs: {
		id: string;
		url: string;
		thumbUrl: string | null;
		filename: string;
		mimeType: string;
		size: number;
		hash: string;
	}[] = [];

	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		if (!(file instanceof File)) continue;

		// MediaRecorder tags voice recordings as `audio/webm;codecs=opus`. Compare
		// against the allow-list using just the type/subtype, not the codec params.
		const baseMimeType = file.type.split(';')[0].trim();
		if (!ALLOWED_FILE_TYPES.includes(baseMimeType)) {
			return c.json({ error: `File type not allowed: ${file.type}` }, 400);
		}

		if (file.size > MAX_FILE_SIZE) {
			return c.json({ error: `File too large: ${file.name}. Max 100MB` }, 400);
		}

		const rawBuffer = Buffer.from(await file.arrayBuffer());
		const rawHash = rawHashes[i] || hashBuffer(rawBuffer);

		let ext: string;
		let finalMimeType = baseMimeType;
		let finalSize = file.size;
		let hash: string;
		let pending: { kind: 'buffer'; buffer: Buffer } | { kind: 'tmp'; tmpPath: string };
		let thumbBuffer: Buffer | null = null;

		if (file.type.startsWith('image/')) {
			const compressed = await compressImage(rawBuffer, file.type);
			ext = compressed.ext;
			finalMimeType = compressed.mimeType;
			finalSize = compressed.buffer.length;
			hash = hashBuffer(compressed.buffer);
			pending = { kind: 'buffer', buffer: compressed.buffer };
			thumbBuffer = compressed.thumb?.buffer ?? null;
		} else if (file.type.startsWith('video/')) {
			const compressed = await compressVideo(rawBuffer, TMP_DIR);
			ext = compressed.ext;
			finalMimeType = compressed.mimeType;
			finalSize = compressed.size;
			hash = await hashFilePath(compressed.filePath);
			pending = { kind: 'tmp', tmpPath: compressed.filePath };
		} else {
			ext = file.name.split('.').pop() || 'bin';
			hash = hashBuffer(rawBuffer);
			pending = { kind: 'buffer', buffer: rawBuffer };
		}

		const existing = await db.query.fileBlobs.findFirst({
			where: eq(fileBlobs.hash, hash),
		});

		let storedName: string;
		let thumbStoredName: string | null;
		if (existing) {
			storedName = existing.storedName;
			finalMimeType = existing.mimeType;
			finalSize = existing.size;
			thumbStoredName = existing.thumbStoredName;
			if (pending.kind === 'tmp') {
				await unlink(pending.tmpPath).catch(() => {});
			}
			// Backfill: an older blob may pre-date the thumbnail rollout. If we
			// just generated one for this upload and the row has no thumb yet,
			// write it and update the row.
			if (!thumbStoredName && thumbBuffer) {
				const tname = `${hash}_thumb.webp`;
				await storage.put(tname, thumbBuffer, 'image/webp');
				await db
					.update(fileBlobs)
					.set({ thumbStoredName: tname, thumbSize: thumbBuffer.length })
					.where(eq(fileBlobs.hash, hash));
				thumbStoredName = tname;
			}
		} else {
			storedName = `${hash}.${ext}`;
			if (pending.kind === 'buffer') {
				await storage.put(storedName, pending.buffer, finalMimeType);
			} else {
				await storage.putFile(storedName, pending.tmpPath, finalMimeType);
			}

			thumbStoredName = null;
			let thumbSize: number | null = null;
			if (thumbBuffer) {
				thumbStoredName = `${hash}_thumb.webp`;
				thumbSize = thumbBuffer.length;
				await storage.put(thumbStoredName, thumbBuffer, 'image/webp');
			}

			await db
				.insert(fileBlobs)
				.values({
					hash,
					storedName,
					mimeType: finalMimeType,
					size: finalSize,
					thumbStoredName,
					thumbSize,
				})
				.onConflictDoNothing({ target: fileBlobs.hash });
		}

		await db
			.insert(blobGrants)
			.values({ fileHash: hash, scopeType, scopeId })
			.onConflictDoNothing();

		await db
			.insert(rawBlobMap)
			.values({ rawHash, fileHash: hash })
			.onConflictDoNothing({ target: rawBlobMap.rawHash });

		blobs.push({
			id: randomUUID(),
			url: `/blobs/files/${storedName}`,
			thumbUrl: thumbStoredName ? `/blobs/files/${thumbStoredName}` : null,
			filename: file.name,
			mimeType: finalMimeType,
			size: finalSize,
			hash,
		});
	}

	return c.json({ blobs });
});

// Pre-upload dedup check. Client proves possession via rawHash and the server
// returns the stored blob, atomically recording a grant for the requested
// scope. A miss returns null. Hits without scope write access are forbidden,
// closing the rawHash existence oracle.
blobRoutes.post('/check', async (c) => {
	const userId = c.get('user').userId;
	const body = await c.req.json<{
		scopeType?: string;
		scopeId?: string;
		files: { rawHash: string; filename: string }[];
	}>();

	const scopeTypeRaw = body?.scopeType ?? 'pending';
	const scopeIdRaw = body?.scopeId ?? userId;
	if (!isValidScopeType(scopeTypeRaw)) {
		return c.json({ error: 'Invalid scopeType' }, 400);
	}
	const scopeType: ScopeType = scopeTypeRaw;
	const scopeId = scopeIdRaw;

	if (!(await canWriteScope(userId, scopeType, scopeId))) {
		return c.json({ error: 'Forbidden' }, 403);
	}

	if (!Array.isArray(body?.files) || body.files.length === 0) {
		return c.json({ results: [] });
	}

	const results: (
		| null
		| {
			id: string;
			url: string;
			thumbUrl: string | null;
			filename: string;
			mimeType: string;
			size: number;
			hash: string;
		}
	)[] = [];

	for (const f of body.files) {
		if (!f?.rawHash || typeof f.rawHash !== 'string') {
			results.push(null);
			continue;
		}

		const map = await db.query.rawBlobMap.findFirst({
			where: eq(rawBlobMap.rawHash, f.rawHash),
		});
		if (!map) {
			results.push(null);
			continue;
		}

		const blob = await db.query.fileBlobs.findFirst({
			where: eq(fileBlobs.hash, map.fileHash),
		});
		if (!blob) {
			await db.delete(rawBlobMap).where(eq(rawBlobMap.rawHash, f.rawHash));
			results.push(null);
			continue;
		}

		await db
			.insert(blobGrants)
			.values({ fileHash: blob.hash, scopeType, scopeId })
			.onConflictDoNothing();

		results.push({
			id: randomUUID(),
			url: `/blobs/files/${blob.storedName}`,
			thumbUrl: blob.thumbStoredName ? `/blobs/files/${blob.thumbStoredName}` : null,
			filename: f.filename,
			mimeType: blob.mimeType,
			size: blob.size,
			hash: blob.hash,
		});
	}

	return c.json({ results });
});

// Add grants for existing blobs. Used by /send and /forward to bind chat
// attachments to the destination chat. Idempotent: re-adding an existing
// grant is a no-op.
blobRoutes.post('/grants', async (c) => {
	const userId = c.get('user').userId;
	const body = await c.req.json<{ scopeType: string; scopeId: string; hashes: string[] }>();

	if (!isValidScopeType(body?.scopeType)) {
		return c.json({ error: 'Invalid scopeType' }, 400);
	}
	if (typeof body.scopeId !== 'string' || !Array.isArray(body.hashes)) {
		return c.json({ error: 'Invalid body' }, 400);
	}
	if (body.hashes.length === 0) {
		return c.json({ ok: true });
	}

	if (!(await canWriteScope(userId, body.scopeType, body.scopeId))) {
		return c.json({ error: 'Forbidden' }, 403);
	}

	const rows = body.hashes
		.filter((h): h is string => typeof h === 'string' && h.length > 0)
		.map((fileHash) => ({ fileHash, scopeType: body.scopeType, scopeId: body.scopeId }));

	if (rows.length > 0) {
		// Skip rows whose blob was already GC'd, otherwise the FK fires.
		const existing = await db.query.fileBlobs.findMany({
			where: (t, { inArray }) => inArray(t.hash, rows.map((r) => r.fileHash)),
			columns: { hash: true },
		});
		const live = new Set(existing.map((e) => e.hash));
		const liveRows = rows.filter((r) => live.has(r.fileHash));
		if (liveRows.length > 0) {
			await db.insert(blobGrants).values(liveRows).onConflictDoNothing();
		}
	}

	return c.json({ ok: true });
});

// Remove grants. When a hash has no remaining grants the blob is GC'd.
blobRoutes.delete('/grants', async (c) => {
	const userId = c.get('user').userId;
	const body = await c.req.json<{ scopeType: string; scopeId: string; hashes: string[] }>();

	if (!isValidScopeType(body?.scopeType)) {
		return c.json({ error: 'Invalid scopeType' }, 400);
	}
	if (typeof body.scopeId !== 'string' || !Array.isArray(body.hashes)) {
		return c.json({ error: 'Invalid body' }, 400);
	}
	if (body.hashes.length === 0) {
		return c.json({ ok: true });
	}

	if (!(await canWriteScope(userId, body.scopeType, body.scopeId))) {
		return c.json({ error: 'Forbidden' }, 403);
	}

	for (const hash of body.hashes) {
		if (typeof hash !== 'string' || hash.length === 0) continue;
		await db
			.delete(blobGrants)
			.where(
				and(
					eq(blobGrants.fileHash, hash),
					eq(blobGrants.scopeType, body.scopeType),
					eq(blobGrants.scopeId, body.scopeId),
				),
			);
		await gcIfOrphan(hash);
	}

	return c.json({ ok: true });
});
