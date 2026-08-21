// Backfill: move existing plaintext group messages into the ciphertext columns.
//
//   pnpm --filter @echo/groups-service run encrypt:backfill
//
// Idempotent — it only looks at rows with no content_ciphertext, so running it
// twice is free and an interrupted run resumes where it stopped.
//
// It clears `content`, `attachments` and `reply_to_snapshot` in the same
// statement that writes the ciphertext. That matters: leaving them behind would
// store every message twice, once encrypted and once not, and the row would be
// no more private than before. New writes already leave them empty, so
// afterwards the plaintext columns hold nothing anywhere in the table.
import 'dotenv/config';
import { isNull, eq } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { groupMessages } from '../db/schema.js';
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
				id: groupMessages.id,
				content: groupMessages.content,
				attachments: groupMessages.attachments,
				replyToSnapshot: groupMessages.replyToSnapshot,
			})
			.from(groupMessages)
			.where(isNull(groupMessages.contentCiphertext))
			.limit(BATCH);

		if (rows.length === 0) break;

		for (const row of rows) {
			// The row id is the AAD, which is why the backfill can re-encrypt in
			// place at all: the binding is to the row, not to when it was written.
			const enc = encryptForInsert(row.id, {
				content: row.content ?? '',
				attachments: Array.isArray(row.attachments) ? (row.attachments as unknown[]) : [],
				replyToSnapshot: row.replyToSnapshot ?? null,
			});

			await db
				.update(groupMessages)
				.set({
					...enc,
					content: '',
					attachments: [],
					replyToSnapshot: null,
				})
				.where(eq(groupMessages.id, row.id));
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
