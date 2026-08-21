// Backfill: move existing plaintext messages into the ciphertext columns.
// Idempotent — skips rows that already have content_ciphertext set.
// Run with: pnpm --filter pers-chats-service run encrypt:backfill
//
// It clears `content`, `attachments` and `reply_to_snapshot` in the same
// statement that writes the ciphertext. That is the point of the exercise:
// leaving them behind stores every message twice, once encrypted and once not,
// and the row is no more private than before it ran. New writes already leave
// them empty, so afterwards the plaintext columns hold nothing in the table.
import 'dotenv/config';
import { sql, isNull } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { personalMessages } from '../db/schema.js';
import { config } from '../config.js';
import { encryptForInsert } from '../crypto.js';
import { log } from '../log.js';

const BATCH = 500;

async function main() {
	const db = createDb(config.databaseUrl);
	let total = 0;
	while (true) {
		const rows = await db
			.select({
				id: personalMessages.id,
				content: personalMessages.content,
				attachments: personalMessages.attachments,
				replyToSnapshot: personalMessages.replyToSnapshot,
			})
			.from(personalMessages)
			.where(isNull(personalMessages.contentCiphertext))
			.limit(BATCH);

		if (rows.length === 0) break;

		for (const row of rows) {
			const enc = encryptForInsert(row.id, {
				content: row.content ?? '',
				attachments: Array.isArray(row.attachments) ? (row.attachments as unknown[]) : [],
				replyToSnapshot: row.replyToSnapshot ?? null,
			});
			await db
				.update(personalMessages)
				.set({
					contentCiphertext: enc.contentCiphertext,
					contentNonce: enc.contentNonce,
					contentKeyId: enc.contentKeyId,
					attachmentsCiphertext: enc.attachmentsCiphertext,
					attachmentsNonce: enc.attachmentsNonce,
					attachmentsKeyId: enc.attachmentsKeyId,
					replyToSnapshotCiphertext: enc.replyToSnapshotCiphertext,
					replyToSnapshotNonce: enc.replyToSnapshotNonce,
					replyToSnapshotKeyId: enc.replyToSnapshotKeyId,
					attachmentsMeta: enc.attachmentsMeta,
					// The whole reason to run this. `attachments_meta` above keeps the
					// hash/type/size the media and GC queries need, so emptying the
					// jsonb column costs nothing.
					content: '',
					attachments: [],
					replyToSnapshot: null,
				})
				.where(sql`${personalMessages.id} = ${row.id}`);
		}
		total += rows.length;
		log.info({ total }, 'backfill progress');
		if (rows.length < BATCH) break;
	}
	log.info({ total }, 'backfill done');
	process.exit(0);
}

main().catch((err) => {
	log.error({ err }, 'failed');
	process.exit(1);
});
