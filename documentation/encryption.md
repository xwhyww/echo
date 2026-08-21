
How encryption works

Scope: **personal chats, group messages and voice-channel chats** all use this,
under one `MESSAGE_ENCRYPTION_KEY`. The row-level logic lives once in
`@echo/shared/crypto` (`messageRow.ts`) and each service wraps it in its own
`src/crypto.ts`; the low-level AES-GCM primitives are in `messageCipher.ts`
beside it. Both are unit-tested.


Per-message flow (write):
1. Server generates messageId = randomUUID() upfront.
2. For each sensitive field (content, attachments, replyToSnapshot):                                             
   - Fresh random 12-byte nonce.                           
   - AES-256-GCM encrypt with current key; AAD = messageId (UTF-8 bytes).
   - 16-byte auth tag appended to ciphertext.
3. Stored in personal_messages as three columns per field: *_ciphertext bytea, *_nonce bytea, *_key_id smallint.
4. A non-sensitive attachments_meta jsonb sidecar keeps {hash, mimeType, size} in plaintext so GC, stats, and
   media listings can run SQL filters without decrypting.

Read flow:
1. Row is fetched as usual.
2. decryptRow() looks up the key by content_key_id in config.encryptionKeys, verifies the GCM tag, checks AAD =
   row id, returns plaintext.
3. Response substitutes plaintext back in; ciphertext columns are stripped via stripCiphertext().

AAD binding — because messageId is the AAD, an operator can't swap ciphertext between rows: decryption with a
different row's id fails the tag check.

How keys are stored

- Not in the DB. Keys live only in the MESSAGE_ENCRYPTION_KEY env var, loaded at startup into
  config.encryptionKeys: Map<number, Buffer>.
- Env var format: either <base64> (implicit key_id=1) or "1:<b64>,2:<b64>,..." for multi-key. Each value must
  decode to exactly 32 bytes.
- MESSAGE_ENCRYPTION_CURRENT_KEY_ID selects which key new writes use (defaults to the highest id in the map).
- In production the env var should come from a secret manager (AWS Secrets Manager, Vault, GCP Secret Manager,
  Docker secrets, etc.) — never committed. .env.example documents it with an empty value; docker-compose.yml reads
  ${MESSAGE_ENCRYPTION_KEY} from the host environment.
- Key loss = data loss. If you lose the key, every encrypted row becomes permanently unreadable. Back it up to
  two independent stores.

What happens to old messages when the key changes

The key_id column is why rotation is non-destructive. Rotation procedure:

1. Add the new key alongside the old one:
   MESSAGE_ENCRYPTION_KEY="1:<old_b64>,2:<new_b64>"
   MESSAGE_ENCRYPTION_CURRENT_KEY_ID=2
2. Restart pers-chats.
   - New writes encrypt with key_id=2.
   - Old rows still have key_id=1 stored per column — reads look up key 1 from the map and decrypt fine. Nothing
   breaks, no downtime.
3. Run pnpm run encrypt:backfill at your leisure — it re-encrypts rows under the current key. Each of the three
   services has its own:
     pnpm --filter @echo/pers-chats-service run encrypt:backfill
     pnpm --filter @echo/groups-service run encrypt:backfill
     pnpm --filter @echo/voice-service run encrypt:backfill
   (The scripts only touch rows with content_ciphertext IS NULL, so to use them for rotation you would widen the
   filter to rows where content_key_id != currentKeyId.)

   Note what the backfill does besides writing ciphertext: it **clears content, attachments and reply_to_snapshot**
   in the same statement. Leaving them would store every message twice, once encrypted and once not, and the row
   would be no more private than before it ran. attachments_meta keeps the hash/mimeType/size that the media, stats
   and blob-GC queries need, so emptying the jsonb column costs nothing.
4. Once backfill is done and verified, remove the old key from MESSAGE_ENCRYPTION_KEY, leaving only 2:<new_b64>.
   Restart.

If you just swap the key without keeping the old one in the map: every existing row's GCM auth tag will fail to
verify on read, and decryptRow throws unknown key_id 1 (or a tag-mismatch error if you reused id 1). The rows
become unreadable until you restore the old key. This is a footgun — always add-then-remove, never replace in
place.

Emergency re-keying (suspected key compromise): same flow but compress the window — add new key, bump current id,
run backfill immediately, then drop the old key. The old ciphertext on any leaked DB dump is still decryptable
with the leaked key, so the window between compromise and full backfill is your exposure.
