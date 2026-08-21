import { parseKey, encryptString, decryptString, encryptJSON, decryptJSON } from './messageCipher.js';

/**
 * At-rest encryption of a message row, shared by every service that stores
 * messages — personal chats, groups, and voice-channel chats.
 *
 * `messageCipher` below it knows how to encrypt a value; this knows which three
 * fields of a message are sensitive, what the columns are called, and how a row
 * that predates the migration should behave. Kept in one place because three
 * copies of "which fields are secret" is how one of them quietly stops matching
 * the others.
 */

export interface EncryptionKeys {
	keys: Map<number, Buffer>;
	currentKeyId: number;
}

/**
 * Reads `MESSAGE_ENCRYPTION_KEY` in either form: a bare `<base64>` (implicit key
 * id 1) or `1:<b64>,2:<b64>` for rotation.
 *
 * Throws rather than defaulting. A service that starts without a usable key
 * would write rows nobody can read, and would not find out until someone tried.
 */
export function loadEncryptionKeys(raw: string | undefined, currentIdRaw?: string): EncryptionKeys {
	if (!raw) {
		throw new Error('MESSAGE_ENCRYPTION_KEY is required (base64-encoded 32 bytes)');
	}
	const keys = new Map<number, Buffer>();
	if (raw.includes(':')) {
		for (const part of raw.split(',')) {
			const [idStr, b64] = part.trim().split(':');
			const id = Number(idStr);
			if (!Number.isInteger(id) || id < 1) {
				throw new Error(`invalid key_id in MESSAGE_ENCRYPTION_KEY: ${idStr}`);
			}
			keys.set(id, parseKey(b64));
		}
	} else {
		keys.set(1, parseKey(raw));
	}

	const currentKeyId = Number(currentIdRaw || Math.max(...keys.keys()));
	if (!keys.has(currentKeyId)) {
		throw new Error(
			`MESSAGE_ENCRYPTION_CURRENT_KEY_ID=${currentKeyId} not present in MESSAGE_ENCRYPTION_KEY`,
		);
	}
	return { keys, currentKeyId };
}

/**
 * Attachment fields that stay in plaintext, so media listings, stats and the
 * blob GC's grant reconciliation can run as jsonb queries instead of decrypting
 * every message in the table. Filenames are *not* here — they stay inside the
 * encrypted blob, because a filename is often the most revealing part of an
 * attachment.
 */
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

/**
 * Any row from a messages table satisfies this. The ciphertext columns are
 * optional because rows written before the migration have none, and the
 * plaintext columns go on being the fallback until a backfill re-encrypts them.
 */
export interface DecryptableRow {
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

export type CiphertextColumns =
	| 'contentCiphertext' | 'contentNonce' | 'contentKeyId'
	| 'attachmentsCiphertext' | 'attachmentsNonce' | 'attachmentsKeyId'
	| 'replyToSnapshotCiphertext' | 'replyToSnapshotNonce' | 'replyToSnapshotKeyId';

export function attachmentMetaFrom(attachments: unknown): AttachmentMeta[] {
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

/**
 * Meta-aware hash extractor. New rows answer from `attachmentsMeta`; rows that
 * predate it fall back to `attachments`, which by then is either still
 * plaintext or has been decrypted in place.
 */
export function attachmentHashesFromRow(row: {
	attachmentsMeta?: unknown;
	attachments?: unknown;
}): string[] {
	const src =
		Array.isArray(row.attachmentsMeta) && row.attachmentsMeta.length > 0
			? row.attachmentsMeta
			: Array.isArray(row.attachments)
				? row.attachments
				: [];
	const out: string[] = [];
	for (const a of src) {
		const h = a && typeof a === 'object' && 'hash' in a ? (a as { hash?: string }).hash : null;
		if (h) out.push(h);
	}
	return out;
}

export interface RowCipher {
	encryptForInsert(messageId: string, plain: MessagePlaintext): EncryptedColumns;
	decryptRow<T extends DecryptableRow>(row: T): T;
	stripCiphertext<T extends DecryptableRow>(row: T): Omit<T, CiphertextColumns>;
}

export function createRowCipher(config: EncryptionKeys): RowCipher {
	return {
		/**
		 * Encrypts the three sensitive fields under the current key, binding each
		 * ciphertext to `messageId` through the AAD so they cannot be swapped
		 * between rows. Callers generate the id up front and insert it explicitly,
		 * which is what makes the AAD stable.
		 */
		encryptForInsert(messageId, plain) {
			const keyId = config.currentKeyId;
			const key = config.keys.get(keyId);
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
				attachmentsMeta: attachmentMetaFrom(attachmentsArr),
			};
		},

		/**
		 * A shallow copy with the three fields replaced by their plaintext where
		 * ciphertext is present. Rows with no ciphertext pass through untouched.
		 */
		decryptRow(row) {
			const out = { ...row };
			if (row.contentCiphertext && row.contentNonce && row.contentKeyId != null) {
				out.content = decryptString(
					row.contentCiphertext,
					row.contentNonce,
					row.contentKeyId,
					config.keys,
					row.id,
				);
			}
			if (row.attachmentsCiphertext && row.attachmentsNonce && row.attachmentsKeyId != null) {
				out.attachments = decryptJSON(
					row.attachmentsCiphertext,
					row.attachmentsNonce,
					row.attachmentsKeyId,
					config.keys,
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
					config.keys,
					row.id,
				);
			}
			return out;
		},

		/**
		 * Drops the bytea columns before a row goes out over HTTP. Without this
		 * they are serialised as base64 arrays — large, binary, and of no use to
		 * any client.
		 */
		stripCiphertext(row) {
			const {
				contentCiphertext: _a, contentNonce: _b, contentKeyId: _c,
				attachmentsCiphertext: _d, attachmentsNonce: _e, attachmentsKeyId: _f,
				replyToSnapshotCiphertext: _g, replyToSnapshotNonce: _h, replyToSnapshotKeyId: _i,
				...rest
			} = row as DecryptableRow & Record<string, unknown>;
			return rest as Omit<typeof row, CiphertextColumns>;
		},
	};
}

/**
 * Pairs one row of a media listing with the attachment it refers to.
 *
 * A media query scans `COALESCE(attachments_meta, attachments)` so it can filter
 * and paginate in SQL. For an encrypted row that lands on the meta projection —
 * hash, type and size — which is enough to filter on but not to render: the url,
 * filename and id are inside the ciphertext. This resolves the meta entry back
 * to the full attachment out of the decrypted array.
 *
 * `meta` is what the SQL returned, `ord` its 1-based ordinality, `plaintext` the
 * decrypted attachments of that message, and `metaList` the message's whole meta
 * array — not just the entries on this page, so the answer does not change when
 * a message straddles a page boundary.
 *
 * Returns undefined when nothing matches, which the caller drops from the page.
 */
export function resolveAttachment(
	meta: Record<string, unknown> | null | undefined,
	ord: number,
	plaintext: Record<string, unknown>[],
	metaList: Record<string, unknown>[],
): Record<string, unknown> | undefined {
	const m = meta ?? {};
	// A row written before the migration already carries the full attachment.
	if (typeof m.url === 'string') return m;

	if (typeof m.hash !== 'string') return plaintext[ord - 1];

	// A message can carry the same file twice, and both meta entries then share a
	// hash. Matching on the hash alone would hand every copy the *first*
	// plaintext entry, so the page comes back with one attachment repeated.
	// Pair the Nth meta entry with the Nth plaintext entry of that hash instead.
	const index = ord - 1;
	let rank = 0;
	for (let i = 0; i < index && i < metaList.length; i++) {
		if (metaList[i]?.hash === m.hash) rank++;
	}
	let seen = 0;
	return plaintext.find((a) => a?.hash === m.hash && seen++ === rank);
}
