import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGO = 'aes-256-gcm';
const NONCE_LEN = 12;
const TAG_LEN = 16;

export interface EncryptedField {
	ciphertext: Buffer;
	nonce: Buffer;
	keyId: number;
}

// Parses a base64-encoded 32-byte key. Throws if malformed so misconfiguration
// surfaces at startup rather than on first write.
export function parseKey(b64: string): Buffer {
	const buf = Buffer.from(b64, 'base64');
	if (buf.length !== 32) {
		throw new Error(`MESSAGE_ENCRYPTION_KEY must decode to 32 bytes, got ${buf.length}`);
	}
	return buf;
}

// AAD binds the ciphertext to the row it lives on so an operator can't swap
// ciphertexts between rows (e.g. replace one user's message body with another
// message's ciphertext). The messageId is used as AAD everywhere.
export function encryptString(
	plaintext: string,
	key: Buffer,
	keyId: number,
	aad: string,
): EncryptedField {
	const nonce = randomBytes(NONCE_LEN);
	const cipher = createCipheriv(ALGO, key, nonce);
	cipher.setAAD(Buffer.from(aad, 'utf8'));
	const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return { ciphertext: Buffer.concat([ct, tag]), nonce, keyId };
}

export function decryptString(
	ciphertext: Buffer,
	nonce: Buffer,
	keyId: number,
	keys: Map<number, Buffer>,
	aad: string,
): string {
	const key = keys.get(keyId);
	if (!key) throw new Error(`unknown key_id ${keyId}`);
	if (ciphertext.length < TAG_LEN) throw new Error('ciphertext too short');
	const ct = ciphertext.subarray(0, ciphertext.length - TAG_LEN);
	const tag = ciphertext.subarray(ciphertext.length - TAG_LEN);
	const decipher = createDecipheriv(ALGO, key, nonce);
	decipher.setAAD(Buffer.from(aad, 'utf8'));
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export function encryptJSON(
	value: unknown,
	key: Buffer,
	keyId: number,
	aad: string,
): EncryptedField {
	return encryptString(JSON.stringify(value), key, keyId, aad);
}

export function decryptJSON<T = unknown>(
	ciphertext: Buffer,
	nonce: Buffer,
	keyId: number,
	keys: Map<number, Buffer>,
	aad: string,
): T {
	return JSON.parse(decryptString(ciphertext, nonce, keyId, keys, aad)) as T;
}
