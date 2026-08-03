import { eq, and, lt, sql } from 'drizzle-orm';
import type { Database } from './db/index.js';
import { fileBlobs, blobGrants } from './db/schema.js';
import { storage } from './storage.js';

// Drop the file row + delete the stored object if no grants reference it.
// CASCADE on rawBlobMap takes care of the dedup mapping.
export async function gcIfOrphan(db: Database, hash: string): Promise<void> {
	const remaining = await db
		.select({ c: sql<number>`count(*)` })
		.from(blobGrants)
		.where(eq(blobGrants.fileHash, hash));
	if (Number(remaining[0]?.c ?? 0) > 0) return;

	const [row] = await db
		.delete(fileBlobs)
		.where(eq(fileBlobs.hash, hash))
		.returning({ storedName: fileBlobs.storedName, thumbStoredName: fileBlobs.thumbStoredName });
	if (row) {
		await storage.delete(row.storedName);
		if (row.thumbStoredName) {
			await storage.delete(row.thumbStoredName);
		}
	}
}

const PENDING_TTL_HOURS = 24;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly

// Sweep pending(userId) grants older than PENDING_TTL_HOURS — these are blobs
// the client uploaded but never committed via /send. Each affected hash gets
// the orphan check; if no other grant remains, the blob is deleted.
export async function sweepStalePendingGrants(db: Database): Promise<void> {
	const cutoff = sql`now() - interval '${sql.raw(String(PENDING_TTL_HOURS))} hours'`;

	const stale = await db
		.select({ fileHash: blobGrants.fileHash })
		.from(blobGrants)
		.where(and(eq(blobGrants.scopeType, 'pending'), lt(blobGrants.createdAt, cutoff)));

	if (stale.length === 0) return;

	const affected = new Set(stale.map((r) => r.fileHash));

	await db
		.delete(blobGrants)
		.where(and(eq(blobGrants.scopeType, 'pending'), lt(blobGrants.createdAt, cutoff)));

	for (const hash of affected) {
		await gcIfOrphan(db, hash);
	}

	console.log(`[blob-service] gc: swept ${stale.length} stale pending grants, ${affected.size} hashes checked`);
}

export function startPendingGrantsGC(db: Database): void {
	void sweepStalePendingGrants(db).catch((err) => {
		console.error('[blob-service] gc: initial sweep failed:', err);
	});

	setInterval(() => {
		void sweepStalePendingGrants(db).catch((err) => {
			console.error('[blob-service] gc: sweep failed:', err);
		});
	}, SWEEP_INTERVAL_MS).unref();
}
