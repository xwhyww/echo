// Backfill: re-encrypt existing plaintext messages into the new ciphertext
// columns. Idempotent — skips rows that already have content_ciphertext set.
// Run with: pnpm --filter pers-chats-service run encrypt:backfill
import 'dotenv/config';
import { sql, isNull, and } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { personalMessages } from '../db/schema.js';
import { config } from '../config.js';
import { encryptForInsert } from '../crypto.js';

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
				})
				.where(sql`${personalMessages.id} = ${row.id}`);
		}
		total += rows.length;
		console.log(`[backfill] processed ${total}`);
		if (rows.length < BATCH) break;
	}
	console.log(`[backfill] done, total=${total}`);
	process.exit(0);
}

main().catch((err) => {
	console.error('[backfill] failed:', err);
	process.exit(1);
});
