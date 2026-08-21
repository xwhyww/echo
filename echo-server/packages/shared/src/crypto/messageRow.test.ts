import { describe, it, expect } from 'vitest';
import { randomBytes } from 'crypto';
import {
	loadEncryptionKeys,
	createRowCipher,
	attachmentMetaFrom,
	attachmentHashesFromRow,
	resolveAttachment,
	type DecryptableRow,
} from './messageRow.js';

const b64 = () => randomBytes(32).toString('base64');

describe('loadEncryptionKeys', () => {
	it('accepts a bare key as id 1', () => {
		const raw = b64();
		const { keys, currentKeyId } = loadEncryptionKeys(raw);
		expect(currentKeyId).toBe(1);
		expect(keys.get(1)).toEqual(Buffer.from(raw, 'base64'));
	});

	it('accepts the rotation form and defaults to the highest id', () => {
		const one = b64();
		const two = b64();
		const { keys, currentKeyId } = loadEncryptionKeys(`1:${one},2:${two}`);
		expect(currentKeyId).toBe(2);
		expect(keys.size).toBe(2);
	});

	it('honours an explicit current id', () => {
		// Rotation is two steps: add the key, then start writing with it. Between
		// them the new key is loaded but not current.
		const { currentKeyId } = loadEncryptionKeys(`1:${b64()},2:${b64()}`, '1');
		expect(currentKeyId).toBe(1);
	});

	it('refuses to start without a key', () => {
		expect(() => loadEncryptionKeys(undefined)).toThrow(/required/);
	});

	it('refuses a current id that is not loaded', () => {
		// Otherwise the service starts and fails on the first write instead.
		expect(() => loadEncryptionKeys(b64(), '7')).toThrow(/not present/);
	});

	it('refuses a malformed key id', () => {
		expect(() => loadEncryptionKeys(`x:${b64()}`)).toThrow(/invalid key_id/);
		expect(() => loadEncryptionKeys(`0:${b64()}`)).toThrow(/invalid key_id/);
	});
});

describe('attachmentMetaFrom', () => {
	it('keeps the hash, type and size and drops everything else', () => {
		// Specifically the filename: it stays inside the encrypted blob.
		expect(
			attachmentMetaFrom([
				{ hash: 'a1', mimeType: 'image/webp', size: 10, name: 'passport.webp' },
			]),
		).toEqual([{ hash: 'a1', mimeType: 'image/webp', size: 10 }]);
	});

	it('skips entries with no hash, and non-arrays', () => {
		expect(attachmentMetaFrom([{ mimeType: 'image/webp' }, null, 'x'])).toEqual([]);
		expect(attachmentMetaFrom(undefined)).toEqual([]);
		expect(attachmentMetaFrom('not an array')).toEqual([]);
	});
});

describe('attachmentHashesFromRow', () => {
	it('prefers the plaintext meta column', () => {
		expect(
			attachmentHashesFromRow({
				attachmentsMeta: [{ hash: 'meta' }],
				attachments: [{ hash: 'body' }],
			}),
		).toEqual(['meta']);
	});

	it('falls back to attachments for rows written before the meta column', () => {
		expect(attachmentHashesFromRow({ attachments: [{ hash: 'body' }] })).toEqual(['body']);
		expect(attachmentHashesFromRow({ attachmentsMeta: [], attachments: [{ hash: 'body' }] }))
			.toEqual(['body']);
	});

	it('is empty when there is nothing to read', () => {
		expect(attachmentHashesFromRow({})).toEqual([]);
	});
});

describe('createRowCipher', () => {
	const raw = b64();
	const cipher = createRowCipher(loadEncryptionKeys(raw));
	const ID = 'b3f1c0de-0000-4000-8000-000000000001';

	const plain: {
		content: string;
		attachments: unknown[];
		replyToSnapshot: { authorId: string; content: string } | null;
	} = {
		content: 'Привет 👋',
		attachments: [{ hash: 'a1', mimeType: 'image/webp', size: 10, name: 'секрет.webp' }],
		replyToSnapshot: { authorId: 'u1', content: 'earlier' },
	};

	function rowFrom(id: string, p: typeof plain): DecryptableRow & Record<string, unknown> {
		const cols = cipher.encryptForInsert(id, p);
		// The stored row: plaintext columns emptied, ciphertext columns filled.
		// That is what the migration leaves behind for a newly written message.
		return { id, content: '', attachments: [], replyToSnapshot: null, ...cols };
	}

	it('round-trips a whole row', () => {
		const out = cipher.decryptRow(rowFrom(ID, plain));
		expect(out.content).toBe(plain.content);
		expect(out.attachments).toEqual(plain.attachments);
		expect(out.replyToSnapshot).toEqual(plain.replyToSnapshot);
	});

	it('leaves nothing sensitive in the stored row', () => {
		const row = rowFrom(ID, plain);
		expect(row.content).toBe('');
		const blob = Buffer.concat([
			row.contentCiphertext as Buffer,
			row.attachmentsCiphertext as Buffer,
		]).toString('utf8');
		expect(blob).not.toContain('Привет');
		expect(blob).not.toContain('секрет');
	});

	it('keeps the attachment meta readable for media queries', () => {
		const row = rowFrom(ID, plain);
		expect(row.attachmentsMeta).toEqual([{ hash: 'a1', mimeType: 'image/webp', size: 10 }]);
	});

	it('stores no reply snapshot when there is none', () => {
		const row = rowFrom(ID, { ...plain, replyToSnapshot: null });
		expect(row.replyToSnapshotCiphertext).toBeNull();
		expect(row.replyToSnapshotKeyId).toBeNull();
		expect(cipher.decryptRow(row).replyToSnapshot).toBeNull();
	});

	it('will not decrypt a ciphertext moved onto another row', () => {
		// The AAD is the message id, so this is the defence against an operator
		// rewriting one message with another's body.
		const mine = rowFrom(ID, plain);
		const theirs = rowFrom('b3f1c0de-0000-4000-8000-000000000002', plain);
		expect(() =>
			cipher.decryptRow({ ...theirs, contentCiphertext: mine.contentCiphertext }),
		).toThrow();
	});

	it('passes a row with no ciphertext through untouched', () => {
		// Rows written before the migration: the plaintext columns go on being the
		// answer until a backfill re-encrypts them.
		const legacy: DecryptableRow = {
			id: ID,
			content: 'written before encryption',
			attachments: [{ hash: 'old' }],
			replyToSnapshot: null,
		};
		expect(cipher.decryptRow(legacy)).toEqual(legacy);
	});

	it('drops the bytea columns before the row goes out over HTTP', () => {
		const stripped = cipher.stripCiphertext(rowFrom(ID, plain)) as Record<string, unknown>;
		for (const key of [
			'contentCiphertext', 'contentNonce', 'contentKeyId',
			'attachmentsCiphertext', 'attachmentsNonce', 'attachmentsKeyId',
			'replyToSnapshotCiphertext', 'replyToSnapshotNonce', 'replyToSnapshotKeyId',
		]) {
			expect(stripped).not.toHaveProperty(key);
		}
		// And keeps what the client actually needs.
		expect(stripped).toHaveProperty('id');
		expect(stripped).toHaveProperty('attachmentsMeta');
	});

	it('decrypts a row written under an older key after rotation', () => {
		const older = createRowCipher(loadEncryptionKeys(raw));
		const row = { id: ID, content: '', attachments: [], replyToSnapshot: null,
			...older.encryptForInsert(ID, plain) };

		const rotated = createRowCipher(loadEncryptionKeys(`1:${raw},2:${b64()}`));
		expect(rotated.decryptRow(row).content).toBe(plain.content);
		// And new writes use the new key.
		expect(rotated.encryptForInsert(ID, plain).contentKeyId).toBe(2);
	});
});

describe('resolveAttachment', () => {
	const full = (hash: string, url: string) => ({ hash, url, filename: `${url}.webp` });

	it('returns a pre-migration attachment as-is', () => {
		const legacy = { hash: 'a', url: '/x', filename: 'x.webp' };
		expect(resolveAttachment(legacy, 1, [], [])).toBe(legacy);
	});

	it('resolves a meta entry to the full attachment', () => {
		const plaintext = [full('a', '/a'), full('b', '/b')];
		const metaList = [{ hash: 'a' }, { hash: 'b' }];
		expect(resolveAttachment({ hash: 'b' }, 2, plaintext, metaList)).toEqual(full('b', '/b'));
	});

	it('gives each copy of a repeated file its own attachment', () => {
		// The case that makes ordinal ranking necessary: matching on hash alone
		// hands both rows the first entry, and the page shows one file twice.
		const plaintext = [full('a', '/first'), full('a', '/second')];
		const metaList = [{ hash: 'a' }, { hash: 'a' }];
		expect(resolveAttachment({ hash: 'a' }, 1, plaintext, metaList)).toEqual(full('a', '/first'));
		expect(resolveAttachment({ hash: 'a' }, 2, plaintext, metaList)).toEqual(full('a', '/second'));
	});

	it('ranks against the whole meta list, not just this page', () => {
		// Same second copy, but reached on a page that begins mid-message.
		const plaintext = [full('a', '/first'), full('b', '/b'), full('a', '/second')];
		const metaList = [{ hash: 'a' }, { hash: 'b' }, { hash: 'a' }];
		expect(resolveAttachment({ hash: 'a' }, 3, plaintext, metaList)).toEqual(full('a', '/second'));
	});

	it('falls back to the ordinal when the meta entry has no hash', () => {
		const plaintext = [full('a', '/a'), full('b', '/b')];
		expect(resolveAttachment({ size: 1 }, 2, plaintext, [])).toEqual(full('b', '/b'));
	});

	it('is undefined when nothing matches, so the caller can drop the row', () => {
		expect(resolveAttachment({ hash: 'missing' }, 1, [full('a', '/a')], [{ hash: 'a' }]))
			.toBeUndefined();
		expect(resolveAttachment(null, 1, [], [])).toBeUndefined();
	});
});
