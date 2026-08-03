import { encryptString, decryptString, encryptJSON, decryptJSON } from '@echo/shared';
import { config } from './config.js';

// Non-sensitive attachment metadata kept in plaintext so we can run
// jsonb queries (media listing, GC grant reconciliation, stats) without
// decrypting every message. Filenames stay inside the encrypted blob.
export interface AttachmentMeta {
	hash: string;
	mimeType?: string;
	size?: number;
}

export interface MessagePlaintext {
	content: string;
	attachments: unknown[];
	replyToSnapshot?: unknown | null;
}

export interface EncryptedColumns {
	contentCiphertext: Buffer;
	contentNonce: Buffer;
	contentKeyId: number;
	attachmentsCiphertext: Buffer;
	attachmentsNonce: Buffer;
	attachmentsKeyId: number;
	replyToSnapshotCiphertext: Buffer | null;
	replyToSnapshotNonce: Buffer | null;
	replyToSnapshotKeyId: number | null;
	attachmentsMeta: AttachmentMeta[];
}

function metaFromAttachments(attachments: unknown): AttachmentMeta[] {
	if (!Array.isArray(attachments)) return [];
	const out: AttachmentMeta[] = [];
	for (const a of attachments) {
		if (!a || typeof a !== 'object') continue;
		const rec = a as Record<string, unknown>;
		const hash = typeof rec.hash === 'string' ? rec.hash : null;
		if (!hash) continue;
		out.push({
			hash,
			mimeType: typeof rec.mimeType === 'string' ? rec.mimeType : undefined,
			size: typeof rec.size === 'number' ? rec.size : undefined,
		});
	}
	return out;
}

// Encrypt the three sensitive fields of a message under the current key,
// binding each ciphertext to `messageId` via AAD so they can't be swapped
// between rows. Callers generate the messageId up front and insert it
// explicitly so the AAD is stable.
export function encryptForInsert(messageId: string, plain: MessagePlaintext): EncryptedColumns {
	const keyId = config.currentKeyId;
	const key = config.encryptionKeys.get(keyId);
	if (!key) throw new Error(`currentKeyId=${keyId} not loaded`);

	const content = encryptString(plain.content ?? '', key, keyId, messageId);
	const attachmentsArr = Array.isArray(plain.attachments) ? plain.attachments : [];
	const attachments = encryptJSON(attachmentsArr, key, keyId, messageId);
	const rts = plain.replyToSnapshot
		? encryptJSON(plain.replyToSnapshot, key, keyId, messageId)
		: null;

	return {
		contentCiphertext: content.ciphertext,
		contentNonce: content.nonce,
		contentKeyId: keyId,
		attachmentsCiphertext: attachments.ciphertext,
		attachmentsNonce: attachments.nonce,
		attachmentsKeyId: keyId,
		replyToSnapshotCiphertext: rts?.ciphertext ?? null,
		replyToSnapshotNonce: rts?.nonce ?? null,
		replyToSnapshotKeyId: rts?.keyId ?? null,
		attachmentsMeta: metaFromAttachments(attachmentsArr),
	};
}

// Row shape the decryptor understands — any drizzle row from personal_messages
// will satisfy this, since the ciphertext columns are optional for legacy
// rows that predate the migration.
interface DecryptableRow {
	id: string;
	content: string | null;
	attachments: unknown;
	replyToSnapshot: unknown;
	contentCiphertext?: Buffer | null;
	contentNonce?: Buffer | null;
	contentKeyId?: number | null;
	attachmentsCiphertext?: Buffer | null;
	attachmentsNonce?: Buffer | null;
	attachmentsKeyId?: number | null;
	replyToSnapshotCiphertext?: Buffer | null;
	replyToSnapshotNonce?: Buffer | null;
	replyToSnapshotKeyId?: number | null;
}

// Returns a shallow copy with content/attachments/replyToSnapshot replaced
// by the decrypted plaintext when ciphertext is present. Legacy rows
// (ciphertext null) pass through untouched so the plaintext columns act
// as a transparent fallback until the backfill re-encrypts them.
export function decryptRow<T extends DecryptableRow>(row: T): T {
	const out: T = { ...row };
	if (row.contentCiphertext && row.contentNonce && row.contentKeyId != null) {
		out.content = decryptString(
			row.contentCiphertext,
			row.contentNonce,
			row.contentKeyId,
			config.encryptionKeys,
			row.id,
		);
	}
	if (row.attachmentsCiphertext && row.attachmentsNonce && row.attachmentsKeyId != null) {
		out.attachments = decryptJSON(
			row.attachmentsCiphertext,
			row.attachmentsNonce,
			row.attachmentsKeyId,
			config.encryptionKeys,
			row.id,
		);
	}
	if (
		row.replyToSnapshotCiphertext &&
		row.replyToSnapshotNonce &&
		row.replyToSnapshotKeyId != null
	) {
		out.replyToSnapshot = decryptJSON(
			row.replyToSnapshotCiphertext,
			row.replyToSnapshotNonce,
			row.replyToSnapshotKeyId,
			config.encryptionKeys,
			row.id,
		);
	}
	return out;
}

// Strip the bytea fields from a row before returning it to HTTP — they're
// large, binary, and would otherwise be JSON-serialised as base64 arrays.
export function stripCiphertext<T extends DecryptableRow>(row: T): Omit<T,
	| 'contentCiphertext' | 'contentNonce' | 'contentKeyId'
	| 'attachmentsCiphertext' | 'attachmentsNonce' | 'attachmentsKeyId'
	| 'replyToSnapshotCiphertext' | 'replyToSnapshotNonce' | 'replyToSnapshotKeyId'
> {
	const {
		contentCiphertext: _a, contentNonce: _b, contentKeyId: _c,
		attachmentsCiphertext: _d, attachmentsNonce: _e, attachmentsKeyId: _f,
		replyToSnapshotCiphertext: _g, replyToSnapshotNonce: _h, replyToSnapshotKeyId: _i,
		...rest
	} = row as DecryptableRow & Record<string, unknown>;
	return rest as any;
}

// Attachments-meta-aware hash extractor. For new rows, meta is the source
// of truth; for legacy rows it falls back to the (decrypted or still
// plaintext) attachments field.
export function attachmentHashesFromRow(row: {
	attachmentsMeta?: unknown;
	attachments?: unknown;
}): string[] {
	const src = Array.isArray(row.attachmentsMeta) && row.attachmentsMeta.length > 0
		? row.attachmentsMeta
		: Array.isArray(row.attachments) ? row.attachments : [];
	const out: string[] = [];
	for (const a of src) {
		const h = a && typeof a === 'object' && 'hash' in a ? (a as { hash?: string }).hash : null;
		if (h) out.push(h);
	}
	return out;
}
