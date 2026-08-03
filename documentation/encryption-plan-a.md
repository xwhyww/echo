# Plan A — Server-Side Message Encryption at Rest

## Threat model

Protects against: database dumps, stolen backups, filesystem access by someone who shouldn't have it, lost/sold disks.

Does **not** protect against: compromised running server, malicious operator with process access, memory scraping. For those threats, see Plan B (E2EE).

This is what Telegram uses for cloud chats and is the right default for most apps.

## Scope

- Encrypt sensitive message fields at rest in the pers-chats-service database.
- Keep the wire protocol (REST + WS) unchanged — clients keep sending/receiving plaintext JSON.
- Zero UX impact.
- Estimated effort: ~2 days.

## Fields to encrypt

In `personal_messages`:
- `content` (primary target)
- `reply_to_snapshot` (contains copied content)
- `attachments[].filename` (filenames can be sensitive, e.g. "passport.pdf")

In `personal_message_links`:
- `url` (decide — URLs often reveal recipient intent)

Not encrypted (needed for queries/ordering):
- `id`, `chat_id`, `author_id`, `created_at`, `updated_at`, `is_edited`
- `pinned_at`, `pinned_by`, `forwarded_from`, `reply_to_id`
- Attachment metadata other than filename (`hash`, `mimeType`, `size`)

## Key management

- Single 32-byte symmetric key, base64-encoded in env var `MESSAGE_ENCRYPTION_KEY`.
- Loaded at service startup into `config.messageEncryptionKey` (Buffer).
- Rotation-ready: add a `key_id smallint` column on every encrypted row. Application keeps a `Map<number, Buffer>` of active keys; new writes use the current `key_id`, reads select by stored `key_id`.
- Key generation (one-time):
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
- Store the key in the deployment secret manager, not in the repo.

## Crypto primitives

- Algorithm: **AES-256-GCM** via Node `crypto` (no extra deps).
- Per-message random 12-byte nonce.
- 16-byte auth tag, appended to ciphertext.
- Associated data (AAD): `message.id` as UTF-8 bytes, to bind the ciphertext to its row (prevents a swap attack where an operator moves ciphertext between rows).

### Shared module — `packages/shared/src/crypto/messageCipher.ts`

```ts
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGO = 'aes-256-gcm';
const NONCE_LEN = 12;
const TAG_LEN = 16;

export interface EncryptedField {
  ciphertext: Buffer;
  nonce: Buffer;
  keyId: number;
}

export function encryptString(plaintext: string, key: Buffer, keyId: number, aad: string): EncryptedField {
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv(ALGO, key, nonce);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([ct, tag]), nonce, keyId };
}

export function decryptString(field: EncryptedField, keys: Map<number, Buffer>, aad: string): string {
  const key = keys.get(field.keyId);
  if (!key) throw new Error(`unknown key_id ${field.keyId}`);
  const ct = field.ciphertext.subarray(0, field.ciphertext.length - TAG_LEN);
  const tag = field.ciphertext.subarray(field.ciphertext.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, field.nonce);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
```

For JSON fields (`reply_to_snapshot`, `attachments`) wrap with `JSON.stringify` / `JSON.parse`.

## Schema changes

Drizzle migration in `pers-chats-service/drizzle/00XX_encrypt_messages.sql`:

```sql
ALTER TABLE personal_messages
  ADD COLUMN content_ciphertext bytea,
  ADD COLUMN content_nonce bytea,
  ADD COLUMN content_key_id smallint,
  ADD COLUMN reply_to_snapshot_ciphertext bytea,
  ADD COLUMN reply_to_snapshot_nonce bytea,
  ADD COLUMN reply_to_snapshot_key_id smallint;

-- attachments stored as jsonb; encrypt the whole blob and keep a jsonb "shape"
-- column with non-sensitive metadata for queries
ALTER TABLE personal_messages
  ADD COLUMN attachments_ciphertext bytea,
  ADD COLUMN attachments_nonce bytea,
  ADD COLUMN attachments_key_id smallint,
  ADD COLUMN attachments_meta jsonb; -- [{hash, mimeType, size}] for GC + previews
```

Leave `content`, `reply_to_snapshot`, `attachments` nullable during migration. Drop them in a follow-up migration once backfill is verified.

The existing `attachments @> …::jsonb` query used in `removeChatGrantsIfUnused` (line ~54 of `personalChats.ts`) must be rewritten to read `attachments_meta` instead — this is the one query that actually inspects attachment contents. The GC reconciliation can work entirely off `attachments_meta`.

## Read / write wiring

All changes live in `pers-chats-service` — the gateway, user-service, friends-service, and blob-service don't touch message content.

### Write (POST `/personal-chats/:id/send`, PATCH `/personal-chats/messages/:id`)

1. Generate `messageId = randomUUID()` up front (so AAD is stable).
2. Encrypt `content`, `reply_to_snapshot`, `attachments` with `aad = messageId`.
3. Insert ciphertext + nonce + key_id columns. Also write `attachments_meta` with `{ hash, mimeType, size }` array for GC and `lastMessage` previews.
4. Keep returning the plaintext in the 200 response so the client doesn't change.
5. WS `publishDmEvent` also keeps sending plaintext — consumers are clients, not storage.

### Read (GET messages, GET `/personal-chats` for `lastMessage`)

1. Fetch rows as usual.
2. Decrypt `content`, `reply_to_snapshot`, `attachments` using `messageId` as AAD.
3. Substitute into the response object.
4. Wrap with a helper `decryptMessageRow(row, keys)` so every caller uses the same path.

### `lastMessage` preview in GET `/personal-chats`

Currently it selects `content` and `attachments` directly. Update the select to include the ciphertext columns, then decrypt on the way out. Attachments preview only uses `mimeType`, which is in `attachments_meta` — no decryption needed for that field.

## Migration / backfill

One-shot script `pers-chats-service/src/scripts/encryptBackfill.ts`:

1. Pull rows where `content_ciphertext IS NULL AND content IS NOT NULL` in batches of 500.
2. For each row, encrypt `content`, `reply_to_snapshot`, `attachments`; populate ciphertext columns + `attachments_meta`.
3. Write back in a transaction.
4. After success on all rows, drop the plaintext columns in a follow-up migration.

Run it with a feature flag `ENCRYPTION_ENABLED=true`. Application reads fall back to plaintext columns when ciphertext is null so the service keeps working during backfill.

## Implementation checklist

1. `packages/shared/src/crypto/messageCipher.ts` — encrypt/decrypt helpers + tests.
2. `pers-chats-service/src/config.ts` — parse `MESSAGE_ENCRYPTION_KEY`, build keys Map.
3. `drizzle/00XX_encrypt_messages.sql` — additive migration.
4. `src/db/schema.ts` — add new columns.
5. `src/routes/personalChats.ts`:
   - `encryptForInsert(messageId, plain)` helper.
   - `decryptRow(row)` helper.
   - Wire into `/send`, `/edit`, `/forward`, GET messages, GET `/personal-chats`, WS publish payload.
   - Rewrite `removeChatGrantsIfUnused` to use `attachments_meta`.
6. `src/scripts/encryptBackfill.ts` — backfill script + `pnpm run encrypt:backfill`.
7. Follow-up migration: drop plaintext columns.
8. `docker-compose.yml` — add `MESSAGE_ENCRYPTION_KEY` env to `pers-chats` service.
9. `.env.example` — document the var.

## Operational notes

- **Backups**: encrypted-at-rest in the DB, but DB backups must still be stored securely; the key lives outside the DB so a DB-only leak yields ciphertext.
- **Logs**: scrub message content from request logs — Hono's `logger()` only logs method/path/status, so this is already safe, but check any added `console.log` on the write path.
- **Key loss = data loss**: if `MESSAGE_ENCRYPTION_KEY` is lost, all messages become unreadable. Back up the key to two separate secret stores.
- **Rotation**: to rotate, add the new key to the map with a higher `key_id`, start writing with it, run a backfill job to re-encrypt old rows at your leisure, then remove the old key from the map.

## What this doesn't solve

- Server operator can still read messages in memory / via process dump.
- WebSocket traffic is still plaintext over TLS — relies on TLS for transport confidentiality.
- Push notification previews (if added later) contain plaintext.
- Attachment bodies in blob-service are **not** encrypted — consider a Plan A.5 that encrypts stored blobs with a per-blob data key if attachment content confidentiality matters.

For any of the above, Plan B (E2EE with libsignal) is the answer.
