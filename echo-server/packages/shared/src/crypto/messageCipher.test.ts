import { describe, it, expect } from 'vitest';
import { randomBytes } from 'crypto';
import {
	parseKey,
	encryptString,
	decryptString,
	encryptJSON,
	decryptJSON,
} from './messageCipher.js';

// These are the functions standing between every stored message and being
// unreadable. A bug here does not fail loudly at write time — it fails at read
// time, on data that can no longer be recovered, which is why they are the first
// thing in this repo to get tests.

const KEY_ID = 1;
const key = randomBytes(32);
const keys = new Map([[KEY_ID, key]]);
const AAD = 'b3f1c0de-0000-4000-8000-000000000001';

describe('parseKey', () => {
	it('accepts a base64 32-byte key', () => {
		expect(parseKey(key.toString('base64'))).toEqual(key);
	});

	it('rejects a key of the wrong length', () => {
		// Misconfiguration has to surface at startup rather than on first write:
		// a short key would otherwise throw from deep inside a request.
		expect(() => parseKey(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
		expect(() => parseKey('')).toThrow(/32 bytes/);
	});
});

describe('encryptString / decryptString', () => {
	it('round-trips', () => {
		const { ciphertext, nonce } = encryptString('hello', key, KEY_ID, AAD);
		expect(decryptString(ciphertext, nonce, KEY_ID, keys, AAD)).toBe('hello');
	});

	it('round-trips an empty string', () => {
		// A message with only an attachment stores '' as its content.
		const { ciphertext, nonce } = encryptString('', key, KEY_ID, AAD);
		expect(decryptString(ciphertext, nonce, KEY_ID, keys, AAD)).toBe('');
	});

	it('round-trips multi-byte text', () => {
		const text = 'Привет 👋 — ещё один тест';
		const { ciphertext, nonce } = encryptString(text, key, KEY_ID, AAD);
		expect(decryptString(ciphertext, nonce, KEY_ID, keys, AAD)).toBe(text);
	});

	it('produces a different nonce and ciphertext every time', () => {
		// Reusing a nonce under one key breaks GCM outright, so this is not a
		// style preference.
		const a = encryptString('same', key, KEY_ID, AAD);
		const b = encryptString('same', key, KEY_ID, AAD);
		expect(a.nonce.equals(b.nonce)).toBe(false);
		expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
	});

	it('does not leave the plaintext in the ciphertext', () => {
		const { ciphertext } = encryptString('needle', key, KEY_ID, AAD);
		expect(ciphertext.toString('utf8')).not.toContain('needle');
	});

	it('refuses a ciphertext from a different row', () => {
		// The whole point of the AAD: an operator with database access must not be
		// able to move one message's body onto another message's row.
		const { ciphertext, nonce } = encryptString('secret', key, KEY_ID, AAD);
		expect(() => decryptString(ciphertext, nonce, KEY_ID, keys, 'some-other-id')).toThrow();
	});

	it('refuses a tampered ciphertext', () => {
		const { ciphertext, nonce } = encryptString('secret', key, KEY_ID, AAD);
		const tampered = Buffer.from(ciphertext);
		tampered[0] ^= 0xff;
		expect(() => decryptString(tampered, nonce, KEY_ID, keys, AAD)).toThrow();
	});

	it('refuses a tampered nonce', () => {
		const { ciphertext, nonce } = encryptString('secret', key, KEY_ID, AAD);
		const tampered = Buffer.from(nonce);
		tampered[0] ^= 0xff;
		expect(() => decryptString(ciphertext, tampered, KEY_ID, keys, AAD)).toThrow();
	});

	it('refuses a truncated ciphertext', () => {
		const { nonce } = encryptString('secret', key, KEY_ID, AAD);
		expect(() => decryptString(Buffer.alloc(4), nonce, KEY_ID, keys, AAD)).toThrow(
			/too short/,
		);
	});

	it('names the missing key rather than failing obscurely', () => {
		const { ciphertext, nonce } = encryptString('secret', key, KEY_ID, AAD);
		expect(() => decryptString(ciphertext, nonce, 9, keys, AAD)).toThrow(/unknown key_id 9/);
	});
});

describe('key rotation', () => {
	// Rotation is register-a-new-id, bump the current one, backfill at leisure.
	// So both keys must stay loaded and each row must decrypt under its own.
	const oldKey = key;
	const newKey = randomBytes(32);
	const both = new Map([
		[1, oldKey],
		[2, newKey],
	]);

	it('decrypts each row under the key it was written with', () => {
		const older = encryptString('written under key 1', oldKey, 1, AAD);
		const newer = encryptString('written under key 2', newKey, 2, AAD);

		expect(decryptString(older.ciphertext, older.nonce, older.keyId, both, AAD)).toBe(
			'written under key 1',
		);
		expect(decryptString(newer.ciphertext, newer.nonce, newer.keyId, both, AAD)).toBe(
			'written under key 2',
		);
	});

	it('reports the keyId it used, so the row can record it', () => {
		expect(encryptString('x', newKey, 2, AAD).keyId).toBe(2);
	});

	it('will not decrypt a row with the wrong key', () => {
		// Retiring a key before backfilling would look exactly like this.
		const older = encryptString('written under key 1', oldKey, 1, AAD);
		const onlyNew = new Map([[1, newKey]]);
		expect(() => decryptString(older.ciphertext, older.nonce, 1, onlyNew, AAD)).toThrow();
	});
});

describe('encryptJSON / decryptJSON', () => {
	it('round-trips an attachment list', () => {
		const attachments = [
			{ hash: 'abc', mimeType: 'image/webp', size: 1024, name: 'секрет.webp' },
			{ hash: 'def', mimeType: 'video/mp4', size: 2048 },
		];
		const { ciphertext, nonce } = encryptJSON(attachments, key, KEY_ID, AAD);
		expect(decryptJSON(ciphertext, nonce, KEY_ID, keys, AAD)).toEqual(attachments);
	});

	it('round-trips an empty array', () => {
		const { ciphertext, nonce } = encryptJSON([], key, KEY_ID, AAD);
		expect(decryptJSON(ciphertext, nonce, KEY_ID, keys, AAD)).toEqual([]);
	});

	it('round-trips null', () => {
		// `replyToSnapshot` is null on most messages.
		const { ciphertext, nonce } = encryptJSON(null, key, KEY_ID, AAD);
		expect(decryptJSON(ciphertext, nonce, KEY_ID, keys, AAD)).toBeNull();
	});

	it('keeps filenames out of the ciphertext', () => {
		const { ciphertext } = encryptJSON([{ hash: 'a', name: 'passport.pdf' }], key, KEY_ID, AAD);
		expect(ciphertext.toString('utf8')).not.toContain('passport');
	});
});
