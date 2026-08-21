import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { TestUser } from '@echo/test-support';
import { UPLOADS_DIR, harness } from '../testing/integration.js';

const { createUser, request, exec } = harness;

/**
 * Who may read a blob is not a property of the blob — it is the union of the
 * scopes granted on it, checked against membership mirrors that live in other
 * services. Nothing about that is visible without a database, and getting it
 * wrong means one person's attachments are readable by another.
 *
 * The other half is lifetime: a blob exists exactly as long as some grant
 * points at it. That is a count over a join table, and the failure mode of
 * getting it wrong is either an orphaned file nobody can reach or, worse, a
 * file deleted while a chat still shows it.
 *
 * Uploads run for real against the local disk driver — hashing, compression and
 * deduplication are the parts under test, and a stub of the storage layer would
 * not exercise any of them.
 */
describe.skipIf(!harness.enabled)('blob-service routes', () => {
	beforeAll(() => harness.setup());
	beforeEach(() => harness.reset());

	afterAll(async () => {
		// The local driver writes into the working directory; leaving test blobs
		// in the repo would be rude.
		await rm(UPLOADS_DIR, { recursive: true, force: true });
	});

	const CHAT = 'chat-1';
	const GROUP = 'group-1';

	/** A 1×1 PNG. Small enough to be quick, real enough for sharp to accept. */
	const PNG = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
		'base64',
	);

	function form(
		files: { name: string; type: string; body: Buffer | string }[],
		fields: Record<string, string> = {},
	): FormData {
		const fd = new FormData();
		for (const f of files) {
			fd.append('files', new File([f.body as unknown as BlobPart], f.name, { type: f.type }));
		}
		for (const [k, v] of Object.entries(fields)) fd.append(k, v);
		return fd;
	}

	async function upload(
		user: TestUser,
		files: Parameters<typeof form>[0],
		fields?: Record<string, string>,
	) {
		return request(user, 'POST', '/blobs/upload', form(files, fields));
	}

	async function joinChat(user: TestUser, chatId = CHAT) {
		await exec`INSERT INTO dm_chat_members (chat_id, user_id) VALUES (${chatId}, ${user.id})`;
	}

	async function joinGroup(user: TestUser, groupId = GROUP) {
		await exec`INSERT INTO group_members_mirror (group_id, user_id) VALUES (${groupId}, ${user.id})`;
	}

	describe('auth', () => {
		it('rejects an unauthenticated request', async () => {
			expect((await request(null, 'POST', '/blobs/check', { files: [] })).status).toBe(401);
			expect((await request(null, 'GET', '/blobs/files/abc.png')).status).toBe(401);
		});

		it('accepts the cookie and the query token on the file route only', async () => {
			const me = await createUser();
			const uploaded = await upload(me, [{ name: 'a.txt', type: 'text/plain', body: 'hello' }]);
			const url = uploaded.body.blobs[0].url;

			// <img> and <video> cannot set an Authorization header, which is the
			// whole reason this route has its own auth path.
			const viaCookie = await request(null, 'GET', url, undefined, {
				cookie: `echo_auth=${encodeURIComponent(me.token)}`,
			});
			expect(viaCookie.status).toBe(200);

			const viaQuery = await request(null, 'GET', `${url}?t=${me.token}`);
			expect(viaQuery.status).toBe(200);

			// Not on any other route, though.
			expect((await request(null, 'POST', '/blobs/check', { files: [] }, {
				cookie: `echo_auth=${encodeURIComponent(me.token)}`,
			})).status).toBe(401);
		});
	});

	describe('POST /blobs/upload', () => {
		it('stores a file, grants it to pending(me), and serves it back', async () => {
			const me = await createUser();
			const res = await upload(me, [{ name: 'note.txt', type: 'text/plain', body: 'hello' }]);

			expect(res.status).toBe(200);
			const blob = res.body.blobs[0];
			expect(blob.hash).toBe(createHash('sha256').update('hello').digest('hex'));
			expect(blob.url).toBe(`/blobs/files/${blob.hash}.txt`);

			const grants = await exec`SELECT scope_type, scope_id FROM blob_grants WHERE file_hash = ${blob.hash}`;
			expect(grants).toEqual([{ scope_type: 'pending', scope_id: me.id }]);

			const fetched = await request(me, 'GET', blob.url);
			expect(fetched.status).toBe(200);
			expect(fetched.body).toBe('hello');
		});

		it('deduplicates identical content into one row', async () => {
			const me = await createUser();
			const first = await upload(me, [{ name: 'a.txt', type: 'text/plain', body: 'same bytes' }]);
			const second = await upload(me, [{ name: 'b.txt', type: 'text/plain', body: 'same bytes' }]);

			expect(second.body.blobs[0].hash).toBe(first.body.blobs[0].hash);
			expect(await exec`SELECT hash FROM file_blobs`).toHaveLength(1);
			// Two names, one blob — the filename lives with the message, not here.
			expect(second.body.blobs[0].filename).toBe('b.txt');
		});

		it('compresses an image and generates a thumbnail', async () => {
			const me = await createUser();
			const res = await upload(me, [{ name: 'pic.png', type: 'image/png', body: PNG }]);

			const blob = res.body.blobs[0];
			expect(blob.thumbUrl).toBeTruthy();

			// The hash is of whatever was *kept*, and the extension has to agree
			// with it. A 1x1 PNG is smaller than any WebP re-encode of it, so this
			// one keeps the original — the branch where re-encoding does not pay.
			expect(blob.hash).toBe(createHash('sha256').update(PNG).digest('hex'));
			expect(blob.mimeType).toBe('image/png');
			expect(blob.url.endsWith('.png')).toBe(true);

			const thumb = await request(me, 'GET', blob.thumbUrl);
			expect(thumb.status).toBe(200);
			expect(thumb.headers.get('content-type')).toBe('image/webp');
		});

		it('refuses a type that is not on the allow-list', async () => {
			const me = await createUser();
			const res = await upload(me, [
				{ name: 'run.sh', type: 'application/x-sh', body: 'rm -rf /' },
			]);
			expect(res.status).toBe(400);
			expect(await exec`SELECT hash FROM file_blobs`).toHaveLength(0);
		});

		it('refuses a scope the caller cannot write to', async () => {
			const me = await createUser();
			const stranger = await createUser();

			for (const fields of [
				{ scopeType: 'chat', scopeId: CHAT },
				{ scopeType: 'group', scopeId: GROUP },
				{ scopeType: 'pending', scopeId: stranger.id },
				{ scopeType: 'avatar', scopeId: stranger.id },
			]) {
				const res = await upload(me, [{ name: 'a.txt', type: 'text/plain', body: 'x' }], fields);
				expect(res.status, JSON.stringify(fields)).toBe(403);
			}

			expect((await upload(me, [{ name: 'a.txt', type: 'text/plain', body: 'x' }], {
				scopeType: 'nonsense',
				scopeId: 'x',
			})).status).toBe(400);
		});

		it('lets a member upload into their own chat and group', async () => {
			const me = await createUser();
			await joinChat(me);
			await joinGroup(me);

			expect((await upload(me, [{ name: 'a.txt', type: 'text/plain', body: 'chat' }], {
				scopeType: 'chat',
				scopeId: CHAT,
			})).status).toBe(200);
			expect((await upload(me, [{ name: 'b.txt', type: 'text/plain', body: 'group' }], {
				scopeType: 'group',
				scopeId: GROUP,
			})).status).toBe(200);
		});

		it('caps how many files one request may carry', async () => {
			const me = await createUser();
			const many = Array.from({ length: 11 }, (_, i) => ({
				name: `f${i}.txt`,
				type: 'text/plain',
				body: `file ${i}`,
			}));
			expect((await upload(me, many)).status).toBe(400);
			expect((await upload(me, [])).status).toBe(400);
		});
	});

	describe('reading a file', () => {
		async function uploadedInChat(owner: TestUser) {
			await joinChat(owner);
			const res = await upload(
				owner,
				[{ name: 'secret.txt', type: 'text/plain', body: 'chat secret' }],
				{ scopeType: 'chat', scopeId: CHAT },
			);
			return res.body.blobs[0];
		}

		it('lets a chat member read and refuses everyone else', async () => {
			const owner = await createUser();
			const blob = await uploadedInChat(owner);
			const other = await createUser();
			const outsider = await createUser();
			await joinChat(other);

			expect((await request(other, 'GET', blob.url)).status).toBe(200);
			expect((await request(outsider, 'GET', blob.url)).status).toBe(403);
		});

		it('opens the file to anyone signed in once it is an avatar', async () => {
			const owner = await createUser();
			const res = await upload(owner, [{ name: 'me.txt', type: 'text/plain', body: 'face' }], {
				scopeType: 'avatar',
				scopeId: owner.id,
			});
			const blob = res.body.blobs[0];

			// Avatars show on invite cards and public group listings, to people who
			// are not members of anything yet.
			const stranger = await createUser();
			expect((await request(stranger, 'GET', blob.url)).status).toBe(200);
		});

		it('grants access through any one of several scopes', async () => {
			const owner = await createUser();
			const blob = await uploadedInChat(owner);
			const groupMember = await createUser();
			await joinGroup(groupMember);
			await joinGroup(owner);

			expect((await request(groupMember, 'GET', blob.url)).status).toBe(403);

			// The same bytes forwarded into a group: one more grant, and now the
			// group's members can read it too — without the chat's members losing
			// anything.
			await request(owner, 'POST', '/blobs/grants', {
				scopeType: 'group',
				scopeId: GROUP,
				hashes: [blob.hash],
			});
			expect((await request(groupMember, 'GET', blob.url)).status).toBe(200);
			expect((await request(owner, 'GET', blob.url)).status).toBe(200);
		});

		it('404s a blob with no grants at all rather than leaking that it exists', async () => {
			const owner = await createUser();
			const blob = await uploadedInChat(owner);
			await exec`DELETE FROM blob_grants WHERE file_hash = ${blob.hash}`;

			expect((await request(owner, 'GET', blob.url)).status).toBe(404);
		});

		it('rejects a stored name that is not one', async () => {
			const me = await createUser();
			for (const name of [
				'../../etc/passwd',
				'..%2Fetc',
				'notahash.png',
				'abc.png',
			]) {
				const res = await request(me, 'GET', `/blobs/files/${encodeURIComponent(name)}`);
				expect([400, 404], name).toContain(res.status);
			}
		});

		it('will not serve a thumb name the blob does not have', async () => {
			const me = await createUser();
			const res = await upload(me, [{ name: 'a.txt', type: 'text/plain', body: 'no thumb here' }]);
			const hash = res.body.blobs[0].hash;

			expect((await request(me, 'GET', `/blobs/files/${hash}_thumb.webp`)).status).toBe(404);
		});

		it('answers 304 to a matching ETag and supports a range', async () => {
			const me = await createUser();
			const res = await upload(me, [
				{ name: 'a.txt', type: 'text/plain', body: 'abcdefghij' },
			]);
			const url = res.body.blobs[0].url;

			const first = await request(me, 'GET', url);
			const etag = first.headers.get('etag')!;
			expect(etag).toBeTruthy();
			expect(first.headers.get('cache-control')).toContain('immutable');

			const cached = await request(me, 'GET', url, undefined, { 'if-none-match': etag });
			expect(cached.status).toBe(304);

			const ranged = await request(me, 'GET', url, undefined, { range: 'bytes=2-4' });
			expect(ranged.status).toBe(206);
			expect(ranged.headers.get('content-range')).toBe('bytes 2-4/10');
			expect(ranged.body).toBe('cde');
		});
	});

	describe('grants', () => {
		it('is idempotent and ignores a hash whose blob is gone', async () => {
			const me = await createUser();
			await joinChat(me);
			const res = await upload(me, [{ name: 'a.txt', type: 'text/plain', body: 'grant me' }]);
			const hash = res.body.blobs[0].hash;

			for (let i = 0; i < 2; i++) {
				expect((await request(me, 'POST', '/blobs/grants', {
					scopeType: 'chat',
					scopeId: CHAT,
					hashes: [hash, 'f'.repeat(64)],
				})).status).toBe(200);
			}

			const rows = await exec`SELECT scope_type FROM blob_grants WHERE scope_type = 'chat'`;
			expect(rows).toHaveLength(1);
		});

		it('refuses to grant into a scope the caller is not in', async () => {
			const me = await createUser();
			const res = await upload(me, [{ name: 'a.txt', type: 'text/plain', body: 'x' }]);

			expect((await request(me, 'POST', '/blobs/grants', {
				scopeType: 'chat',
				scopeId: CHAT,
				hashes: [res.body.blobs[0].hash],
			})).status).toBe(403);
		});

		it('deletes the blob when its last grant goes, and not before', async () => {
			const me = await createUser();
			await joinChat(me);
			const res = await upload(me, [{ name: 'a.txt', type: 'text/plain', body: 'lifetime' }]);
			const { hash, url } = res.body.blobs[0];

			await request(me, 'POST', '/blobs/grants', {
				scopeType: 'chat',
				scopeId: CHAT,
				hashes: [hash],
			});

			// Two grants, so dropping one leaves the blob alive.
			await request(me, 'DELETE', '/blobs/grants', {
				scopeType: 'pending',
				scopeId: me.id,
				hashes: [hash],
			});
			expect(await exec`SELECT hash FROM file_blobs WHERE hash = ${hash}`).toHaveLength(1);
			expect((await request(me, 'GET', url)).status).toBe(200);

			// The last one takes the row and the file with it.
			await request(me, 'DELETE', '/blobs/grants', {
				scopeType: 'chat',
				scopeId: CHAT,
				hashes: [hash],
			});
			expect(await exec`SELECT hash FROM file_blobs WHERE hash = ${hash}`).toHaveLength(0);
			expect((await request(me, 'GET', url)).status).toBe(404);
		});

		it('takes the dedup mapping with the blob', async () => {
			const me = await createUser();
			const rawHash = createHash('sha256').update('original bytes').digest('hex');
			await upload(me, [{ name: 'a.txt', type: 'text/plain', body: 'original bytes' }], {
				rawHashes: JSON.stringify([rawHash]),
			});
			expect(await exec`SELECT raw_hash FROM raw_blob_map`).toHaveLength(1);

			const [row] = await exec`SELECT file_hash FROM raw_blob_map`;
			await request(me, 'DELETE', '/blobs/grants', {
				scopeType: 'pending',
				scopeId: me.id,
				hashes: [row.file_hash],
			});

			// ON DELETE CASCADE, so a later /check cannot hand out a hash whose
			// blob no longer exists.
			expect(await exec`SELECT raw_hash FROM raw_blob_map`).toHaveLength(0);
		});
	});

	describe('POST /blobs/check', () => {
		it('finds an already-stored blob by its raw hash and grants it', async () => {
			const uploader = await createUser();
			const rawHash = createHash('sha256').update('shared file').digest('hex');
			await upload(uploader, [{ name: 'a.txt', type: 'text/plain', body: 'shared file' }], {
				rawHashes: JSON.stringify([rawHash]),
			});

			const other = await createUser();
			const res = await request(other, 'POST', '/blobs/check', {
				files: [{ rawHash, filename: 'mine.txt' }],
			});

			expect(res.status).toBe(200);
			expect(res.body.results[0]).toMatchObject({ filename: 'mine.txt' });
			// The point of the endpoint: the second person never sent the bytes,
			// but now holds a grant and can read them.
			expect((await request(other, 'GET', res.body.results[0].url)).status).toBe(200);
		});

		it('returns null for a raw hash it has never seen', async () => {
			const me = await createUser();
			const res = await request(me, 'POST', '/blobs/check', {
				files: [{ rawHash: 'a'.repeat(64), filename: 'x.txt' }],
			});
			expect(res.body.results).toEqual([null]);
		});

		it('will not answer at all for a scope the caller cannot write', async () => {
			const uploader = await createUser();
			const rawHash = createHash('sha256').update('private file').digest('hex');
			await upload(uploader, [{ name: 'a.txt', type: 'text/plain', body: 'private file' }], {
				rawHashes: JSON.stringify([rawHash]),
			});

			// Otherwise the endpoint is an oracle: ask about a hash, learn whether
			// anyone in the system has that exact file.
			const stranger = await createUser();
			const res = await request(stranger, 'POST', '/blobs/check', {
				scopeType: 'chat',
				scopeId: CHAT,
				files: [{ rawHash, filename: 'x.txt' }],
			});
			expect(res.status).toBe(403);
		});
	});
});
